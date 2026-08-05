const VERSION = 1 as const;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const MIN_SECRET_LENGTH = 32;

export const MAX_ROOM_PLAYERS = 4;
const APP_ID = "io.github.wangwanli66.ball-battle-game.v2";

export type MultiplayerRole = "host" | "guest";
export type PlayerIdentity = {name: string; color: string};
export type RoomInvite = {roomCode: string; secret: string};
export type MultiplayerInput = {
  x: number;
  y: number;
  boost: boolean;
  splitSeq: number;
};
export type MultiplayerHello = {
  protocol: typeof VERSION;
  role: MultiplayerRole;
  player: PlayerIdentity;
};
export type SnapshotEnvelope<T> = {
  tick: number;
  payload: T;
};
export type RejectReason = "room-full" | "invalid-input" | "host-conflict";
export type MultiplayerReject = {
  reason: RejectReason;
  message: string;
  fatal: boolean;
};
export type LeaveReason = "local" | "host-left" | "rejected";
export type MultiplayerJoinError = {
  error: string;
  appId: string;
  roomId: string;
  peerId: string;
};

export type ConnectMultiplayerOptions<T> = {
  role: MultiplayerRole;
  roomCode: string;
  secret: string;
  player: PlayerIdentity;
  getWelcomeSnapshot?: (peerId: string) => T | undefined | Promise<T | undefined>;
  onInput?: (input: MultiplayerInput, peerId: string) => void;
  onSnapshot?: (snapshot: SnapshotEnvelope<T>, hostPeerId: string) => void;
  onHello?: (hello: MultiplayerHello, peerId: string) => void;
  onPeerCountChange?: (count: number) => void;
  onPeerLeave?: (peerId: string) => void;
  onHostLeave?: (peerId: string) => void;
  onRejected?: (rejection: MultiplayerReject) => void;
  onJoinError?: (details: MultiplayerJoinError) => void;
  onError?: (error: unknown) => void;
  onLeave?: (reason: LeaveReason) => void;
};

export type MultiplayerConnection<T> = {
  readonly selfId: string;
  getHostPeerId: () => string | null;
  getPeerCount: () => number;
  sendInput: (input: MultiplayerInput) => Promise<boolean>;
  sendSnapshot: (payload: T, targetPeerId?: string) => Promise<boolean>;
  leave: () => Promise<void>;
};

type Action<T> = {
  send: (data: T, options?: {target?: string | string[]}) => Promise<unknown>;
  onMessage: ((data: T, context: {peerId: string}) => void) | null;
};
type Room = {
  makeAction: <T>(id: string) => Action<T>;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave: () => Promise<void>;
};
type Trystero = {
  selfId: string;
  joinRoom: (
    config: {
      appId: string;
      password: string;
      relayConfig: {redundancy: number};
    },
    roomId: string,
    callbacks: {onJoinError: (details: MultiplayerJoinError) => void},
  ) => Room;
};

function randomIndex(max: number) {
  const byte = new Uint8Array(1);
  const limit = Math.floor(256 / max) * max;
  do crypto.getRandomValues(byte);
  while (byte[0] >= limit);
  return byte[0] % max;
}

export function generateRoomCode(): string {
  let code = "";
  while (code.length < 6) code += CODE_CHARS[randomIndex(CODE_CHARS.length)];
  return code;
}

export function generateRoomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}

export function createRoomInvite(): RoomInvite {
  return {roomCode: generateRoomCode(), secret: generateRoomSecret()};
}

export function buildInviteHash(invite: RoomInvite): string {
  const roomCode = normalizeCode(invite.roomCode);
  if (!CODE_RE.test(roomCode)) throw new TypeError("Invalid room code.");
  assertSecret(invite.secret);
  return `#${new URLSearchParams({room: roomCode, key: invite.secret})}`;
}

export function parseInviteHash(hash: string): RoomInvite | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const roomCode = normalizeCode(params.get("room") ?? "");
  const secret = params.get("key") ?? "";
  return CODE_RE.test(roomCode) && secret.length >= MIN_SECRET_LENGTH
    ? {roomCode, secret}
    : null;
}

export function validateMultiplayerInput(value: unknown): MultiplayerInput | null {
  if (!isRecord(value)) return null;
  const {x, y, boost, splitSeq} = value;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof boost !== "boolean" ||
    typeof splitSeq !== "number" ||
    !Number.isSafeInteger(splitSeq) ||
    splitSeq < 0
  ) {
    return null;
  }
  let safeX = clamp(x);
  let safeY = clamp(y);
  const length = Math.hypot(safeX, safeY);
  if (length > 1) {
    safeX /= length;
    safeY /= length;
  }
  return {x: safeX, y: safeY, boost, splitSeq};
}

export async function connectMultiplayer<T>(
  options: ConnectMultiplayerOptions<T>,
): Promise<MultiplayerConnection<T>> {
  const roomCode = normalizeCode(options.roomCode);
  if (!CODE_RE.test(roomCode)) throw new TypeError("Invalid room code.");
  assertSecret(options.secret);

  const {joinRoom, selfId} = (await import("trystero")) as unknown as Trystero;
  const room = joinRoom(
    {
      appId: APP_ID,
      password: options.secret,
      relayConfig: {redundancy: 5},
    },
    roomCode,
    {
      onJoinError: (details) => {
        call(options.onJoinError, details);
        call(options.onError, new Error(details.error));
      },
    },
  );
  const hello = room.makeAction<MultiplayerHello>("hello-v1");
  const input = room.makeAction<MultiplayerInput>("input-v1");
  const snapshot = room.makeAction<SnapshotEnvelope<T>>("snapshot-v1");
  const reject = room.makeAction<MultiplayerReject>("reject-v1");
  const peers = new Set<string>();
  const blocked = new Set<string>();
  const identity = normalizePlayer(options.player);
  const localHello: MultiplayerHello = {
    protocol: VERSION,
    role: options.role,
    player: identity,
  };
  let hostId: string | null = options.role === "host" ? selfId : null;
  let lastTick = -1;
  let nextTick = 0;
  let closed = false;
  let leavePromise: Promise<void> | null = null;

  const count = () => Math.min(MAX_ROOM_PLAYERS, peers.size + 1);
  const emitCount = () => call(options.onPeerCountChange, closed ? 0 : count());
  const background = (promise: Promise<unknown>) =>
    void promise.catch((error) => call(options.onError, error));
  const envelope = (payload: T): SnapshotEnvelope<T> => ({
    tick: nextTick++,
    payload,
  });
  const cleanup = (reason: LeaveReason): Promise<void> => {
    if (leavePromise) return leavePromise;
    closed = true;
    room.onPeerJoin = null;
    room.onPeerLeave = null;
    hello.onMessage = null;
    input.onMessage = null;
    snapshot.onMessage = null;
    reject.onMessage = null;
    peers.clear();
    blocked.clear();
    leavePromise = room.leave().catch((error) => call(options.onError, error));
    emitCount();
    call(options.onLeave, reason);
    return leavePromise;
  };
  const sendReject = (peerId: string, message: MultiplayerReject) =>
    background(reject.send(message, {target: peerId}));
  const welcome = async (peerId: string) => {
    await hello.send(localHello, {target: peerId});
    const payload = await options.getWelcomeSnapshot?.(peerId);
    if (payload !== undefined && !closed && !blocked.has(peerId)) {
      await snapshot.send(envelope(payload), {target: peerId});
    }
  };

  room.onPeerJoin = (peerId) => {
    if (closed || peerId === selfId) return;
    if (options.role === "host" && peers.size >= MAX_ROOM_PLAYERS - 1) {
      blocked.add(peerId);
      background(
        hello.send(localHello, {target: peerId}).then(() =>
          reject.send(
            {reason: "room-full", message: "房间已满", fatal: true},
            {target: peerId},
          ),
        ),
      );
      return;
    }
    peers.add(peerId);
    emitCount();
    background(
      options.role === "host"
        ? welcome(peerId)
        : hello.send(localHello, {target: peerId}),
    );
  };

  room.onPeerLeave = (peerId) => {
    if (closed) return;
    blocked.delete(peerId);
    if (peers.delete(peerId)) emitCount();
    call(options.onPeerLeave, peerId);
    if (options.role === "guest" && peerId === hostId) {
      call(options.onHostLeave, peerId);
      void cleanup("host-left");
    }
  };

  hello.onMessage = (message, {peerId}) => {
    if (closed || blocked.has(peerId) || !isHello(message)) return;
    if (options.role === "host" && message.role === "host") {
      blocked.add(peerId);
      if (peers.delete(peerId)) emitCount();
      sendReject(peerId, {
        reason: "host-conflict",
        message: "已有房主",
        fatal: true,
      });
      return;
    }
    if (options.role === "guest" && message.role === "host") {
      if (hostId && hostId !== peerId) return;
      if (!hostId) {
        hostId = peerId;
      }
    }
    call(options.onHello, {...message, player: normalizePlayer(message.player)}, peerId);
  };

  input.onMessage = (value, {peerId}) => {
    if (
      closed ||
      options.role !== "host" ||
      !peers.has(peerId) ||
      blocked.has(peerId)
    ) {
      return;
    }
    const safe = validateMultiplayerInput(value);
    if (!safe) {
      sendReject(peerId, {
        reason: "invalid-input",
        message: "输入无效",
        fatal: false,
      });
      return;
    }
    call(options.onInput, safe, peerId);
  };

  snapshot.onMessage = (message, {peerId}) => {
    if (
      closed ||
      options.role !== "guest" ||
      peerId !== hostId ||
      !isSnapshot(message) ||
      message.tick <= lastTick
    ) {
      return;
    }
    lastTick = message.tick;
    call(options.onSnapshot, message, peerId);
  };

  reject.onMessage = (message, {peerId}) => {
    if (
      closed ||
      options.role !== "guest" ||
      peerId !== hostId ||
      !isReject(message)
    ) {
      return;
    }
    call(options.onRejected, message);
    if (message.fatal) void cleanup("rejected");
  };

  emitCount();
  return {
    selfId,
    getHostPeerId: () => hostId,
    getPeerCount: () => (closed ? 0 : count()),
    sendInput: async (value) => {
      if (closed || options.role !== "guest" || !hostId) return false;
      const safe = validateMultiplayerInput(value);
      if (!safe) throw new TypeError("Invalid multiplayer input.");
      await input.send(safe, {target: hostId});
      return true;
    },
    sendSnapshot: async (payload, peerId) => {
      if (closed || options.role !== "host") return false;
      if (peerId && (!peers.has(peerId) || blocked.has(peerId))) return false;
      await snapshot.send(envelope(payload), peerId ? {target: peerId} : undefined);
      return true;
    },
    leave: () => cleanup("local"),
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}
function assertSecret(secret: string) {
  if (secret.length < MIN_SECRET_LENGTH) throw new TypeError("Room secret is too short.");
}
function normalizePlayer(player: PlayerIdentity): PlayerIdentity {
  return {
    name: player.name.trim().slice(0, 24) || "匿名球球",
    color: /^#[0-9a-f]{6}$/i.test(player.color) ? player.color : "#7cf6c7",
  };
}
function clamp(value: number) {
  return Math.min(1, Math.max(-1, value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isHello(value: unknown): value is MultiplayerHello {
  return (
    isRecord(value) &&
    value.protocol === VERSION &&
    (value.role === "host" || value.role === "guest") &&
    isRecord(value.player) &&
    typeof value.player.name === "string" &&
    typeof value.player.color === "string"
  );
}
function isSnapshot<T>(value: unknown): value is SnapshotEnvelope<T> {
  return (
    isRecord(value) &&
    typeof value.tick === "number" &&
    Number.isSafeInteger(value.tick) &&
    value.tick >= 0 &&
    "payload" in value
  );
}
function isReject(value: unknown): value is MultiplayerReject {
  return (
    isRecord(value) &&
    ["room-full", "invalid-input", "host-conflict"].includes(value.reason as string) &&
    typeof value.message === "string" &&
    typeof value.fatal === "boolean"
  );
}
function call<TArgs extends unknown[]>(
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
) {
  try {
    callback?.(...args);
  } catch {
  }
}
