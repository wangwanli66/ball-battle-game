import { WORLD_SIZE } from "./game-core.mjs";
import type { Food, GameData, Orb } from "./game-types";

const BOT_NAMES = ["星尘", "糯米团", "小旋风", "蓝莓", "引力波", "橘子汽水", "豆沙包", "晚风", "气泡水", "小行星", "闪电", "银河旅人"];
const BALL_COLORS = ["#ff5f8f", "#7c5cff", "#00c9a7", "#ff9f43", "#4d96ff", "#ff6b6b", "#8bd450", "#e76fff", "#18c8ff", "#ffd93d", "#9b8cff", "#ff7f50"];
const FRIEND_COLORS = ["#7cf6c7", "#66e3ff", "#ffd166", "#ff769e"];
const FOOD_COLORS = ["#ff769e", "#ffd166", "#66e3ff", "#9cff8a", "#bf8cff", "#ff9f68"];
const FOOD_COUNT = 260;
const BOT_COUNT = 12;

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function normalized(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function playerColor(index: number) {
  return FRIEND_COLORS[Math.abs(index) % FRIEND_COLORS.length];
}

export function makeFood(id: number): Food {
  return {
    id,
    x: randomBetween(28, WORLD_SIZE - 28),
    y: randomBetween(28, WORLD_SIZE - 28),
    r: randomBetween(4.2, 7.2),
    color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
  };
}

export function safeSpawn(game: GameData, radius: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const point = {
      x: randomBetween(radius + 60, WORLD_SIZE - radius - 60),
      y: randomBetween(radius + 60, WORLD_SIZE - radius - 60),
    };
    const dangerous = [...game.player, ...game.bots].some(
      (orb) => orb.alive && orb.r > radius * 1.08 && Math.hypot(orb.x - point.x, orb.y - point.y) < orb.r + radius + 230,
    );
    if (!dangerous) return point;
  }
  return { x: randomBetween(200, WORLD_SIZE - 200), y: randomBetween(200, WORLD_SIZE - 200) };
}

export function spawnPlayer(
  game: GameData,
  owner: string,
  name: string,
  color = playerColor(game.player.length),
  spawnAtCenter = false,
) {
  const radius = 27;
  const point = spawnAtCenter
    ? { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 }
    : safeSpawn(game, radius);
  const orb: Orb = {
    id: game.nextId++,
    owner,
    kind: "player",
    name,
    x: point.x,
    y: point.y,
    r: radius,
    color,
    alive: true,
    boosting: false,
    impulseX: 0,
    impulseY: 0,
    dirX: 0,
    dirY: 0,
    targetX: point.x,
    targetY: point.y,
    thinkAt: 0,
    mergeAt: 0,
    respawnAt: 0,
  };
  game.player.push(orb);
  return orb;
}

function makeBot(game: GameData, index: number): Orb {
  const radius = randomBetween(19, 43);
  const point = safeSpawn(game, radius);
  return {
    id: game.nextId++,
    owner: `bot-${index}`,
    kind: "bot",
    name: BOT_NAMES[index % BOT_NAMES.length],
    x: point.x,
    y: point.y,
    r: radius,
    color: BALL_COLORS[index % BALL_COLORS.length],
    alive: true,
    boosting: false,
    impulseX: 0,
    impulseY: 0,
    dirX: Math.cos(index),
    dirY: Math.sin(index),
    targetX: point.x,
    targetY: point.y,
    thinkAt: 0,
    mergeAt: 0,
    respawnAt: 0,
  };
}

export function createGame(playerName = "你", owner = "player", color = playerColor(0)): GameData {
  const game: GameData = {
    phase: "ready",
    player: [],
    bots: [],
    food: [],
    camera: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 },
    elapsed: 0,
    lastSplit: -10,
    nextId: 1,
  };
  spawnPlayer(game, owner, playerName, color, true);
  for (let i = 0; i < FOOD_COUNT; i += 1) game.food.push(makeFood(game.nextId++));
  for (let i = 0; i < BOT_COUNT; i += 1) game.bots.push(makeBot(game, i));
  return game;
}
