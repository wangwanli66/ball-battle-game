import type { MultiplayerConnection, MultiplayerHello, MultiplayerInput } from "./game-network";
import { splitPlayer } from "./game-simulation";
import { spawnPlayer } from "./game-state";
import type { PartyState } from "./PartyPanel";
import type { GameData, PlayerProfile, PointerState } from "./game-types";

export type WorldSnapshot = { game: GameData; profiles: PlayerProfile[] };
export type StoredInput = MultiplayerInput & { receivedAt: number };

export const OFFLINE_PARTY: PartyState = {
  role: "offline",
  status: "offline",
  roomCode: "",
  inviteUrl: "",
  peerCount: 1,
  message: "",
};

export function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 20) || "匿名球球";
}

export function cloneSnapshot(
  game: GameData,
  profiles: Map<string, PlayerProfile>,
): WorldSnapshot {
  return JSON.parse(JSON.stringify({ game, profiles: [...profiles.values()] })) as WorldSnapshot;
}

export function validSnapshot(value: unknown): value is WorldSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WorldSnapshot>;
  const game = snapshot.game as Partial<GameData> | undefined;
  return Boolean(
    game &&
    ["ready", "playing", "paused", "gameover"].includes(String(game.phase)) &&
    Array.isArray(game.player) && game.player.length <= 32 &&
    Array.isArray(game.bots) && game.bots.length <= 20 &&
    Array.isArray(game.food) && game.food.length <= 400 &&
    game.camera && typeof game.camera.x === "number" && typeof game.camera.y === "number" &&
    Array.isArray(snapshot.profiles) && snapshot.profiles.length <= 4,
  );
}

export function normalizeMultiplayerInput(
  pointer: PointerState,
  boost: boolean,
  splitSeq: number,
): MultiplayerInput {
  const length = Math.hypot(pointer.x, pointer.y);
  return {
    x: length > 14 ? pointer.x / length : 0,
    y: length > 14 ? pointer.y / length : 0,
    boost,
    splitSeq,
  };
}

export function createLeaveQueue<T>() {
  let pendingLeave: Promise<void> | null = null;
  return (active: MultiplayerConnection<T> | null) => {
    const current = active?.leave();
    if (!current) return pendingLeave ?? Promise.resolve();
    const previous = pendingLeave;
    const combined = previous
      ? Promise.all([previous, current]).then(() => undefined)
      : current;
    pendingLeave = combined;
    void combined.then(
      () => {
        if (pendingLeave === combined) pendingLeave = null;
      },
      () => {
        if (pendingLeave === combined) pendingLeave = null;
      },
    );
    return combined;
  };
}

export function upsertGuest(
  game: GameData,
  profiles: Map<string, PlayerProfile>,
  remoteInputs: Map<string, StoredInput>,
  hello: MultiplayerHello,
  peerId: string,
  receivedAt: number,
) {
  const existing = profiles.get(peerId);
  const profile: PlayerProfile = {
    owner: peerId,
    name: cleanName(hello.player.name),
    color: hello.player.color,
  };
  profiles.set(peerId, profile);
  if (existing) {
    for (const cell of game.player) {
      if (cell.owner === peerId) cell.name = profile.name;
    }
  } else {
    spawnPlayer(game, profile.owner, profile.name, profile.color);
  }
  remoteInputs.set(peerId, {
    x: 0,
    y: 0,
    boost: false,
    splitSeq: 0,
    receivedAt,
  });
}

export function removeGuest(
  game: GameData,
  profiles: Map<string, PlayerProfile>,
  remoteInputs: Map<string, StoredInput>,
  respawnAt: Map<string, number>,
  peerId: string,
) {
  profiles.delete(peerId);
  remoteInputs.delete(peerId);
  respawnAt.delete(peerId);
  game.player = game.player.filter((cell) => cell.owner !== peerId);
}

export function applyRemoteInput(
  game: GameData,
  profiles: Map<string, PlayerProfile>,
  remoteInputs: Map<string, StoredInput>,
  input: MultiplayerInput,
  peerId: string,
  receivedAt: number,
) {
  if (!profiles.has(peerId)) return;
  const previous = remoteInputs.get(peerId);
  if (previous && input.splitSeq < previous.splitSeq) return;
  if (input.splitSeq > (previous?.splitSeq ?? 0)) {
    splitPlayer(game, { x: input.x * 100, y: input.y * 100, active: true }, peerId);
  }
  remoteInputs.set(peerId, { ...input, receivedAt });
}

export function respawnAbsentPlayers(
  game: GameData,
  profiles: Map<string, PlayerProfile>,
  respawnAt: Map<string, number>,
) {
  for (const profile of profiles.values()) {
    if (game.player.some((cell) => cell.owner === profile.owner)) {
      respawnAt.delete(profile.owner);
      continue;
    }
    const due = respawnAt.get(profile.owner);
    if (due === undefined) respawnAt.set(profile.owner, game.elapsed + 2.4);
    else if (game.elapsed >= due) {
      spawnPlayer(game, profile.owner, profile.name, profile.color);
      respawnAt.delete(profile.owner);
    }
  }
}

export function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
