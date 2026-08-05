"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { boostMassAvailable, buildLeaderboard, scoreForCells } from "./game-core.mjs";
import {
  buildInviteHash,
  connectMultiplayer,
  createRoomInvite,
  type MultiplayerConnection,
  type MultiplayerHello,
  type MultiplayerInput,
} from "./game-network";
import {
  OFFLINE_PARTY,
  applyRemoteInput as applyRemoteInputToWorld,
  cleanName,
  cloneSnapshot,
  createLeaveQueue,
  isTextEntryTarget,
  normalizeMultiplayerInput,
  removeGuest as removeGuestFromWorld,
  respawnAbsentPlayers,
  upsertGuest,
  validSnapshot,
  type StoredInput,
  type WorldSnapshot,
} from "./game-engine-support";
import { createGameRenderer } from "./game-renderer";
import {
  resolveFood,
  resolveOrbs,
  splitPlayer,
  updateBots,
  updateCamera,
  updatePlayer,
} from "./game-simulation";
import { createGame, playerColor, spawnPlayer } from "./game-state";
import type { PartyState } from "./PartyPanel";
import type { GameActions, Leader, Phase, PlayerProfile, PointerState } from "./game-types";

type PointerRef = { current: PointerState };
type PartyActions = {
  create: (name: string) => Promise<void>;
  join: (request: { name: string; roomCode: string; secret: string }) => Promise<void>;
  leave: () => void;
};

const emptyActions: GameActions = {
  start: () => {},
  pause: () => {},
  restart: () => {},
  split: () => {},
  setBoosting: () => {},
};
const emptyPartyActions: PartyActions = {
  create: async () => {},
  join: async () => {},
  leave: () => {},
};


export function useGameEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  pointerRef: PointerRef,
) {
  const actions = useRef<GameActions>(emptyActions);
  const partyActions = useRef<PartyActions>(emptyPartyActions);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(729);
  const [rank, setRank] = useState(1);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [fragments, setFragments] = useState(1);
  const [boosting, setBoosting] = useState(false);
  const [canBoost, setCanBoost] = useState(true);
  const [respawning, setRespawning] = useState(false);
  const [party, setParty] = useState<PartyState>(OFFLINE_PARTY);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let game = createGame();
    const renderer = createGameRenderer(canvas, ctx);
    let animationFrame = 0;
    let lastFrame = performance.now();
    let lastHud = 0;
    let lastSnapshotAt = 0;
    let snapshotInFlight = false;
    let lastInputAt = 0;
    let role: "offline" | "host" | "guest" = "offline";
    let localOwner = "player";
    let boostHeld = false;
    let actualBoosting = false;
    let guestSplitSeq = 0;
    let disposed = false;
    let connectEpoch = 0;
    let hostTimeout: number | null = null;
    let connection: MultiplayerConnection<WorldSnapshot> | null = null;
    let profiles = new Map<string, PlayerProfile>();
    let remoteInputs = new Map<string, StoredInput>();
    const respawnAt = new Map<string, number>();
    const beginLeave = createLeaveQueue<WorldSnapshot>();

    const syncPhase = (next: Phase) => {
      game.phase = next;
      setPhase(next);
      lastFrame = performance.now();
      if (next !== "playing") {
        boostHeld = false;
        actualBoosting = false;
        setBoosting(false);
      }
    };

    const localCells = () => game.player.filter((cell) => cell.owner === localOwner);

    const updateHud = (force = false) => {
      if (!force && game.elapsed - lastHud < 0.16) return;
      lastHud = game.elapsed;
      const board = buildLeaderboard(game.player, game.bots, localOwner) as Leader[];
      const playerIndex = board.findIndex((item) => item.player);
      const cells = localCells();
      setScore(scoreForCells(cells));
      setRank(playerIndex >= 0 ? playerIndex + 1 : board.length);
      setLeaders(board.slice(0, 6));
      setFragments(cells.length);
      setCanBoost(game.phase === "playing" && boostMassAvailable(cells) > 0.5);
      setRespawning(role !== "offline" && game.phase === "playing" && cells.length === 0);
    };

    const applyBoostState = (active: boolean) => {
      if (actualBoosting === active) return;
      actualBoosting = active;
      setBoosting(active);
    };

    const setBoostHeld = (active: boolean) => {
      boostHeld = active && game.phase === "playing" && boostMassAvailable(localCells()) > 0.5;
      if (!boostHeld) applyBoostState(false);
    };

    const resetPointer = () => {
      pointerRef.current = { x: 0, y: 0, active: false };
      setBoostHeld(false);
    };

    const rebuildHostWorld = (nextPhase: Phase = "ready") => {
      const host = profiles.get("player") ?? { owner: "player", name: "你", color: playerColor(0) };
      game = createGame(host.name, host.owner, host.color);
      for (const profile of profiles.values()) {
        if (profile.owner !== "player") spawnPlayer(game, profile.owner, profile.name, profile.color);
      }
      game.phase = nextPhase;
      respawnAt.clear();
      lastHud = -1;
      resetPointer();
      syncPhase(nextPhase);
      updateHud(true);
    };

    const restart = () => {
      if (role === "guest") return;
      if (role === "host") rebuildHostWorld("ready");
      else {
        game = createGame();
        localOwner = "player";
        lastHud = -1;
        resetPointer();
        syncPhase("ready");
        updateHud(true);
      }
    };

    const start = () => {
      if (role === "guest") return;
      if (game.phase === "ready" || game.phase === "paused") syncPhase("playing");
      else if (game.phase === "gameover") restart();
    };

    const pause = () => {
      if (role === "guest") return;
      if (game.phase === "playing") syncPhase("paused");
      else if (game.phase === "paused") syncPhase("playing");
    };

    const normalizedInput = () =>
      normalizeMultiplayerInput(pointerRef.current, boostHeld, guestSplitSeq);

    const transmitInput = () => {
      const activeConnection = connection;
      if (activeConnection) void activeConnection.sendInput(normalizedInput()).catch(() => false);
    };

    const split = () => {
      if (role === "guest") {
        guestSplitSeq += 1;
        transmitInput();
        return;
      }
      if (splitPlayer(game, pointerRef.current, localOwner)) updateHud(true);
    };

    actions.current = { start, pause, restart, split, setBoosting: setBoostHeld };

    const clearInviteHash = () => {
      if (window.location.hash.includes("room=")) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
    };

    const resetOffline = (message = "") => {
      role = "offline";
      localOwner = "player";
      guestSplitSeq = 0;
      profiles = new Map();
      remoteInputs = new Map();
      respawnAt.clear();
      game = createGame();
      resetPointer();
      syncPhase("ready");
      lastHud = -1;
      updateHud(true);
      setParty({ ...OFFLINE_PARTY, status: message ? "error" : "offline", message });
    };

    const clearHostTimeout = () => {
      if (hostTimeout !== null) {
        window.clearTimeout(hostTimeout);
        hostTimeout = null;
      }
    };

    const failConnection = (epoch: number, message: string) => {
      if (disposed || epoch !== connectEpoch) return;
      connectEpoch += 1;
      clearHostTimeout();
      const active = connection;
      connection = null;
      void beginLeave(active);
      clearInviteHash();
      resetOffline(message);
    };

    const leaveRoom = () => {
      connectEpoch += 1;
      clearHostTimeout();
      const active = connection;
      connection = null;
      void beginLeave(active);
      clearInviteHash();
      resetOffline();
    };

    const updatePeerCount = (count: number) => {
      setParty((current) => ({
        ...current,
        peerCount: Math.max(1, count),
        status: role === "host" ? count > 1 ? "connected" : "waiting" : current.status,
        message: role === "host"
          ? count > 1 ? "好友已加入，房主控制开始与暂停" : "房间已创建，等待好友加入"
          : current.message,
      }));
    };

    const addGuest = (hello: MultiplayerHello, peerId: string) => {
      if (role !== "host" || hello.role !== "guest") return;
      upsertGuest(game, profiles, remoteInputs, hello, peerId, performance.now());
      updateHud(true);
    };

    const removeGuest = (peerId: string) => {
      if (role !== "host") return;
      removeGuestFromWorld(game, profiles, remoteInputs, respawnAt, peerId);
      updateHud(true);
    };

    const applyRemoteInput = (input: MultiplayerInput, peerId: string) => {
      if (role !== "host") return;
      applyRemoteInputToWorld(game, profiles, remoteInputs, input, peerId, performance.now());
    };

    const connect = async (
      nextRole: "host" | "guest",
      roomCode: string,
      secret: string,
      name: string,
    ) => {
      const epoch = ++connectEpoch;
      clearHostTimeout();
      const active = connection;
      connection = null;
      await beginLeave(active);
      if (disposed || epoch !== connectEpoch) return;
      role = nextRole;
      guestSplitSeq = 0;
      const safeName = cleanName(name);
      const color = nextRole === "host" ? playerColor(0) : playerColor(1 + Math.floor(Math.random() * 3));
      setParty({
        role: nextRole,
        status: "connecting",
        roomCode,
        inviteUrl: "",
        peerCount: 1,
        message: "正在建立加密的点对点连接…",
      });

      if (nextRole === "host") {
        localOwner = "player";
        profiles = new Map([["player", { owner: "player", name: safeName, color }]]);
        remoteInputs = new Map();
        rebuildHostWorld("ready");
      } else {
        game = createGame(safeName);
        game.player = [];
        game.bots = [];
        game.food = [];
        syncPhase("ready");
      }

      let hostSeen = nextRole === "host";
      let snapshotSeen = false;
      const isCurrent = () => !disposed && epoch === connectEpoch;

      try {
        const nextConnection = await connectMultiplayer<WorldSnapshot>({
          role: nextRole,
          roomCode,
          secret,
          player: { name: safeName, color },
          getWelcomeSnapshot: () =>
            isCurrent() && role === "host" ? cloneSnapshot(game, profiles) : undefined,
          onHello: (hello, peerId) => {
            if (!isCurrent()) return;
            if (nextRole === "guest" && hello.role === "host") {
              hostSeen = true;
            }
            addGuest(hello, peerId);
          },
          onInput: (input, peerId) => {
            if (isCurrent()) applyRemoteInput(input, peerId);
          },
          onPeerLeave: (peerId) => {
            if (isCurrent()) removeGuest(peerId);
          },
          onPeerCountChange: (count) => {
            if (isCurrent()) updatePeerCount(count);
          },
          onSnapshot: (envelope) => {
            if (!isCurrent() || role !== "guest" || !validSnapshot(envelope.payload)) return;
            hostSeen = true;
            snapshotSeen = true;
            clearHostTimeout();
            const camera = game.camera;
            game = envelope.payload.game;
            game.camera = camera;
            profiles = new Map(envelope.payload.profiles.map((profile) => [profile.owner, profile]));
            setPhase(game.phase);
            applyBoostState(game.player.some((cell) => cell.owner === localOwner && cell.boosting));
            setParty((current) => ({
              ...current,
              status: "connected",
              message: "已连接房主，所有碰撞与体型由房主同步",
            }));
            updateHud(true);
          },
          onHostLeave: () => {
            failConnection(epoch, "房主已离开，好友房间已结束");
          },
          onRejected: (rejection) => {
            if (!isCurrent()) return;
            if (rejection.fatal) {
              failConnection(epoch, rejection.message);
              return;
            }
            setParty((current) => ({ ...current, status: "error", message: rejection.message }));
          },
          onJoinError: () => {
            if (isCurrent() && nextRole === "guest" && !hostSeen) {
              failConnection(epoch, "无法与房主完成加密握手，请检查密钥或网络");
            }
          },
          onError: () => {
            if (!isCurrent()) return;
            setParty((current) => ({
              ...current,
              message: current.status === "connected" ? current.message : "部分连接线路正在重试，请稍候…",
            }));
          },
        });
        if (!isCurrent()) {
          await beginLeave(nextConnection);
          return;
        }
        connection = nextConnection;
        if (nextRole === "guest") localOwner = nextConnection.selfId;
        if (nextRole === "guest" && !snapshotSeen) {
          hostTimeout = window.setTimeout(() => {
            failConnection(
              epoch,
              hostSeen ? "已找到房主，但房间同步超时，请重新加入" : "12 秒内未找到房主，请检查房间码、密钥或网络",
            );
          }, 12_000);
        }
        const inviteUrl = `${window.location.href.split("#")[0]}${buildInviteHash({ roomCode, secret })}`;
        window.history.replaceState(null, "", buildInviteHash({ roomCode, secret }));
        setParty((current) => ({
          ...current,
          roomCode,
          inviteUrl,
          status: nextRole === "host" ? "waiting" : snapshotSeen ? "connected" : "waiting",
          message: nextRole === "host"
            ? "房间已创建，复制链接邀请好友"
            : snapshotSeen
              ? current.message
              : "正在寻找房主，请保持页面开启",
        }));
      } catch {
        failConnection(epoch, "无法加入房间，请检查房间码、密钥或当前网络");
      }
    };

    partyActions.current = {
      create: async (name) => {
        const invite = createRoomInvite();
        await connect("host", invite.roomCode, invite.secret, name);
      },
      join: async ({ name, roomCode, secret }) => connect("guest", roomCode, secret, name),
      leave: leaveRoom,
    };

    const frame = (now: number) => {
      const rawDt = (now - lastFrame) / 1000;
      lastFrame = now;
      const dt = Math.min(0.05, Math.max(0, rawDt));

      if (game.phase === "playing" && role !== "guest") {
        game.elapsed += dt;
        applyBoostState(updatePlayer(game, pointerRef.current, dt, "player", boostHeld));
        if (role === "host") {
          for (const profile of profiles.values()) {
            if (profile.owner === "player") continue;
            const input = remoteInputs.get(profile.owner);
            const fresh = input && now - input.receivedAt < 1800;
            const pointer = fresh ? { x: input.x * 100, y: input.y * 100, active: true } : { x: 0, y: 0, active: false };
            updatePlayer(game, pointer, dt, profile.owner, Boolean(fresh && input.boost));
          }
        }
        updateBots(game, dt);
        resolveFood(game);
        const noPlayers = resolveOrbs(game);
        if (role === "offline" && noPlayers) syncPhase("gameover");
        if (role === "host") respawnAbsentPlayers(game, profiles, respawnAt);
        updateCamera(game, dt, localOwner);
        updateHud();
      } else {
        if (role === "guest") {
          if (now - lastInputAt >= 50) {
            lastInputAt = now;
            transmitInput();
          }
          updateCamera(game, Math.min(dt, 0.016), localOwner);
          updateHud();
        } else {
          updateCamera(game, Math.min(dt, 0.016), localOwner);
        }
      }

      if (role === "guest" && game.phase === "playing" && now - lastInputAt >= 50) {
        lastInputAt = now;
        transmitInput();
      }
      if (role === "host" && now - lastSnapshotAt >= 80 && !snapshotInFlight) {
        const activeConnection = connection;
        if (activeConnection) {
          lastSnapshotAt = now;
          snapshotInFlight = true;
          void activeConnection
            .sendSnapshot(cloneSnapshot(game, profiles))
            .catch(() => false)
            .finally(() => {
              snapshotInFlight = false;
            });
        }
      }

      renderer.draw(game, localOwner);
      animationFrame = requestAnimationFrame(frame);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      if (event.key === "Shift") {
        event.preventDefault();
        setBoostHeld(true);
      }
      if (event.code === "Space") {
        event.preventDefault();
        split();
      }
      if (event.key.toLowerCase() === "p" || event.key === "Escape") {
        event.preventDefault();
        pause();
      }
      if (event.key.toLowerCase() === "r") restart();
      if (event.key === "Enter" && game.phase !== "playing") start();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setBoostHeld(false);
    };
    const onVisibilityChange = () => {
      if (document.hidden) setBoostHeld(false);
    };

    renderer.resize();
    updateHud(true);
    window.addEventListener("resize", renderer.resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", resetPointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    animationFrame = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      connectEpoch += 1;
      clearHostTimeout();
      cancelAnimationFrame(animationFrame);
      const active = connection;
      connection = null;
      void beginLeave(active);
      window.removeEventListener("resize", renderer.resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canvasRef, pointerRef]);

  return {
    actions,
    partyActions,
    phase,
    score,
    rank,
    leaders,
    fragments,
    boosting,
    canBoost,
    respawning,
    party,
  };
}
