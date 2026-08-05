import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_SIZE } from "../app/game-core.mjs";
import { spawnPlayer } from "../app/game-state.ts";

test("联机重生在无人存活时仍避开中心的大球", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const centerBot = {
      id: 1,
      owner: "bot-0",
      kind: "bot",
      name: "中心大球",
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      r: 60,
      color: "#ff5f8f",
      alive: true,
      boosting: false,
      impulseX: 0,
      impulseY: 0,
      dirX: 0,
      dirY: 0,
      targetX: 0,
      targetY: 0,
      thinkAt: 0,
      mergeAt: 0,
      respawnAt: 0,
    };
    const game = {
      phase: "playing",
      player: [],
      bots: [centerBot],
      food: [],
      camera: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 },
      elapsed: 12,
      lastSplit: -10,
      nextId: 2,
    };

    const respawned = spawnPlayer(game, "guest-1", "好友", "#66e3ff");

    assert.deepEqual({ x: respawned.x, y: respawned.y }, { x: 87, y: 87 });
    assert.notDeepEqual(
      { x: respawned.x, y: respawned.y },
      { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 },
    );
  } finally {
    Math.random = originalRandom;
  }
});
