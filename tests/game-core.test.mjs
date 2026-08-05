import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOST_MASS_DECAY_PER_SECOND,
  BOOST_MIN_RADIUS,
  BOOST_SPEED_MULTIPLIER,
  WORLD_SIZE,
  boostMassAvailable,
  buildLeaderboard,
  canConsume,
  clampToWorld,
  consumeBoostMass,
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

test("加速按指数衰减消耗质量并应用固定速度倍率", () => {
  const cells = [{ r: 27 }];
  const massBefore = massFromRadius(cells[0].r);
  const expectedConsumed = massBefore * (1 - Math.exp(-BOOST_MASS_DECAY_PER_SECOND));

  const result = consumeBoostMass(cells, 1);

  assert.ok(Math.abs(result.consumed - expectedConsumed) < 1e-9);
  assert.ok(Math.abs(massFromRadius(cells[0].r) - (massBefore - expectedConsumed)) < 1e-9);
  assert.equal(result.intensity, 1);
  assert.equal(speedForRadius(27) * BOOST_SPEED_MULTIPLIER, speedForRadius(27) * 1.45);
});

test("多分身按各自可扣质量比例分摊加速消耗", () => {
  const cells = [{ r: 20 }, { r: 30 }];
  const minimumMass = massFromRadius(BOOST_MIN_RADIUS);
  const availableBefore = boostMassAvailable(cells);
  const firstShare = (massFromRadius(20) - minimumMass) / availableBefore;
  const secondShare = (massFromRadius(30) - minimumMass) / availableBefore;

  const result = consumeBoostMass(cells, 0.5);

  const firstLoss = massFromRadius(20) - massFromRadius(cells[0].r);
  const secondLoss = massFromRadius(30) - massFromRadius(cells[1].r);
  assert.ok(Math.abs(firstLoss - result.consumed * firstShare) < 1e-9);
  assert.ok(Math.abs(secondLoss - result.consumed * secondShare) < 1e-9);
  assert.ok(Math.abs(firstLoss + secondLoss - result.consumed) < 1e-9);
  assert.ok(Math.abs(result.available - boostMassAvailable(cells)) < 1e-9);
});

test("加速消耗永不让任何分身低于最小半径", () => {
  const cells = [{ r: BOOST_MIN_RADIUS + 0.1 }, { r: BOOST_MIN_RADIUS }];
  const availableBefore = boostMassAvailable(cells);

  const result = consumeBoostMass(cells, 60);

  assert.ok(Math.abs(result.consumed - availableBefore) < 1e-9);
  assert.ok(result.intensity > 0 && result.intensity < 1);
  assert.equal(result.available, 0);
  assert.ok(cells.every((cell) => cell.r >= BOOST_MIN_RADIUS));
  assert.ok(Math.abs(cells[0].r - BOOST_MIN_RADIUS) < 1e-12);
});

test("没有可扣质量、空数组或非正时长时不改变球体", () => {
  const protectedCell = { r: BOOST_MIN_RADIUS };
  assert.deepEqual(consumeBoostMass([protectedCell], 1), { consumed: 0, intensity: 0, available: 0 });
  assert.deepEqual(consumeBoostMass([], 1), { consumed: 0, intensity: 0, available: 0 });

  const cell = { r: 27 };
  const available = boostMassAvailable([cell]);
  assert.deepEqual(consumeBoostMass([cell], 0), { consumed: 0, intensity: 0, available });
  assert.deepEqual(consumeBoostMass([cell], -1), { consumed: 0, intensity: 0, available });
  assert.equal(cell.r, 27);
});

test("指数衰减在不同帧步长下保持一致", () => {
  const singleStep = [{ r: 27 }];
  const smallSteps = [{ r: 27 }];

  consumeBoostMass(singleStep, 1);
  for (let index = 0; index < 20; index += 1) consumeBoostMass(smallSteps, 0.05);

  assert.ok(Math.abs(massFromRadius(singleStep[0].r) - massFromRadius(smallSteps[0].r)) < 1e-9);
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
