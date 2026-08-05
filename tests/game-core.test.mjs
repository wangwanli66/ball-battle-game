import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_SIZE,
  buildLeaderboard,
  canConsume,
  clampToWorld,
  massFromRadius,
  mergedRadius,
  scoreForCells,
  speedForRadius,
} from "../app/game-core.mjs";

test("分裂前后总质量守恒", () => {
  const originalRadius = 42;
  const splitRadius = originalRadius / Math.SQRT2;
  assert.ok(Math.abs(massFromRadius(originalRadius) - massFromRadius(splitRadius) * 2) < 1e-9);
});

test("吞噬增长按面积合并", () => {
  const radius = mergedRadius(30, 20);
  assert.equal(Math.round(massFromRadius(radius)), 1300);
});

test("大球更慢且速度保持可操作范围", () => {
  assert.ok(speedForRadius(20) > speedForRadius(80));
  assert.ok(speedForRadius(2) <= 225);
  assert.ok(speedForRadius(1000) >= 72);
});

test("只有尺寸足够且深入包裹才能吞噬", () => {
  const predator = { x: 0, y: 0, r: 40, alive: true };
  assert.equal(canConsume(predator, { x: 18, y: 0, r: 20, alive: true }), true);
  assert.equal(canConsume(predator, { x: 39, y: 0, r: 20, alive: true }), false);
  assert.equal(canConsume(predator, { x: 0, y: 0, r: 38, alive: true }), false);
});

test("球体始终完整留在世界边界内", () => {
  const ball = clampToWorld({ x: -50, y: WORLD_SIZE + 10, r: 25 });
  assert.deepEqual(ball, { x: 25, y: WORLD_SIZE - 25, r: 25 });
});

test("排行榜按总质量排序并合计玩家分身", () => {
  const player = [{ r: 10 }, { r: 10 }];
  const bots = [
    { owner: "b1", name: "小球", r: 8, alive: true },
    { owner: "b2", name: "大球", r: 20, alive: true },
  ];
  assert.equal(scoreForCells(player), 200);
  const board = buildLeaderboard(player, bots);
  assert.deepEqual(board.map((entry) => entry.name), ["大球", "你", "小球"]);
});
