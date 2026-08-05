import {
  canConsume,
  clampToWorld,
  massFromRadius,
  mergedRadius,
  radiusFromMass,
  speedForRadius,
} from "./game-core.mjs";
import { makeFood, normalized, randomBetween, safeSpawn } from "./game-state";
import type { Food, GameData, Orb, PointerState } from "./game-types";

export function splitPlayer(game: GameData, pointer: PointerState) {
  if (game.phase !== "playing" || game.elapsed - game.lastSplit < 0.55 || game.player.length >= 8) return false;
  const aim = normalized(pointer.x, pointer.y);
  const direction = aim.x || aim.y ? aim : { x: 1, y: 0 };
  const newCells: Orb[] = [];
  for (const cell of game.player) {
    if (game.player.length + newCells.length >= 8 || cell.r < 25) continue;
    const nextRadius = cell.r / Math.SQRT2;
    cell.r = nextRadius;
    cell.mergeAt = game.elapsed + 8;
    cell.impulseX -= direction.x * 45;
    cell.impulseY -= direction.y * 45;
    const launchDistance = nextRadius * 1.7;
    newCells.push({
      ...cell,
      id: game.nextId++,
      x: cell.x + direction.x * launchDistance,
      y: cell.y + direction.y * launchDistance,
      impulseX: direction.x * 620,
      impulseY: direction.y * 620,
      mergeAt: game.elapsed + 8,
    });
  }
  if (!newCells.length) return false;
  game.player.push(...newCells);
  game.lastSplit = game.elapsed;
  return true;
}

export function updatePlayer(game: GameData, pointer: PointerState, dt: number) {
  const aimLength = Math.hypot(pointer.x, pointer.y);
  const aim = aimLength > 14 ? normalized(pointer.x, pointer.y) : { x: 0, y: 0 };
  for (const cell of game.player) {
    const damping = Math.exp(-5.2 * dt);
    const speed = speedForRadius(cell.r);
    cell.x += (aim.x * speed + cell.impulseX) * dt;
    cell.y += (aim.y * speed + cell.impulseY) * dt;
    cell.impulseX *= damping;
    cell.impulseY *= damping;
    clampToWorld(cell);
  }

  for (let i = 0; i < game.player.length; i += 1) {
    for (let j = i + 1; j < game.player.length; j += 1) {
      const a = game.player[i];
      const b = game.player[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      if (game.elapsed < Math.max(a.mergeAt, b.mergeAt)) {
        const overlap = a.r + b.r + 3 - distance;
        if (overlap > 0) {
          const push = overlap * 0.52;
          a.x -= (dx / distance) * push;
          a.y -= (dy / distance) * push;
          b.x += (dx / distance) * push;
          b.y += (dy / distance) * push;
        }
      } else {
        const attraction = Math.min(56, distance * 2.2) * dt;
        b.x -= (dx / distance) * attraction;
        b.y -= (dy / distance) * attraction;
        a.x += (dx / distance) * attraction;
        a.y += (dy / distance) * attraction;
        if (distance < Math.max(a.r, b.r) * 0.48) {
          const larger = a.r >= b.r ? a : b;
          const smaller = larger === a ? b : a;
          larger.r = mergedRadius(larger.r, smaller.r);
          larger.x = (larger.x + smaller.x) / 2;
          larger.y = (larger.y + smaller.y) / 2;
          game.player = game.player.filter((cell) => cell.id !== smaller.id);
          return;
        }
      }
    }
  }
}

function chooseBotDirection(game: GameData, bot: Orb) {
  const visible = [...game.player, ...game.bots].filter((orb) => orb.alive && orb.id !== bot.id);
  let threat: Orb | undefined;
  let prey: Orb | undefined;
  let threatDistance = Infinity;
  let preyDistance = Infinity;
  for (const orb of visible) {
    const distance = Math.hypot(orb.x - bot.x, orb.y - bot.y);
    if (orb.r > bot.r * 1.13 && distance < 480 && distance < threatDistance) {
      threat = orb;
      threatDistance = distance;
    }
    if (bot.r > orb.r * 1.14 && distance < 430 && distance < preyDistance) {
      prey = orb;
      preyDistance = distance;
    }
  }
  if (threat) {
    bot.targetX = bot.x + (bot.x - threat.x) * 3;
    bot.targetY = bot.y + (bot.y - threat.y) * 3;
  } else if (prey) {
    bot.targetX = prey.x;
    bot.targetY = prey.y;
  } else {
    let nearestFood: Food | undefined;
    let nearestDistance = 350;
    for (let i = 0; i < game.food.length; i += 3) {
      const item = game.food[i];
      const distance = Math.hypot(item.x - bot.x, item.y - bot.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFood = item;
      }
    }
    if (nearestFood) {
      bot.targetX = nearestFood.x;
      bot.targetY = nearestFood.y;
    } else {
      bot.targetX = clampToWorld({ x: bot.x + randomBetween(-520, 520), y: bot.y + randomBetween(-520, 520), r: bot.r }).x;
      bot.targetY = clampToWorld({ x: bot.x + randomBetween(-520, 520), y: bot.y + randomBetween(-520, 520), r: bot.r }).y;
    }
  }
  bot.thinkAt = game.elapsed + randomBetween(0.28, 0.58);
}

export function updateBots(game: GameData, dt: number) {
  for (const bot of game.bots) {
    if (!bot.alive) {
      if (game.elapsed >= bot.respawnAt) {
        const point = safeSpawn(game, 21);
        Object.assign(bot, {
          x: point.x,
          y: point.y,
          r: randomBetween(19, 28),
          alive: true,
          impulseX: 0,
          impulseY: 0,
          thinkAt: 0,
        });
      }
      continue;
    }
    if (game.elapsed >= bot.thinkAt) chooseBotDirection(game, bot);
    const desired = normalized(bot.targetX - bot.x, bot.targetY - bot.y);
    const turn = 1 - Math.exp(-3.2 * dt);
    bot.dirX += (desired.x - bot.dirX) * turn;
    bot.dirY += (desired.y - bot.dirY) * turn;
    const direction = normalized(bot.dirX, bot.dirY);
    const speed = speedForRadius(bot.r) * 0.94;
    bot.x += direction.x * speed * dt;
    bot.y += direction.y * speed * dt;
    clampToWorld(bot);
  }
}

export function resolveFood(game: GameData) {
  const eaters = [...game.player, ...game.bots.filter((bot) => bot.alive)];
  for (let index = game.food.length - 1; index >= 0; index -= 1) {
    const item = game.food[index];
    let winner: Orb | undefined;
    let deepest = 0;
    for (const orb of eaters) {
      const depth = orb.r - Math.hypot(orb.x - item.x, orb.y - item.y);
      if (depth > item.r * 0.18 && depth > deepest) {
        winner = orb;
        deepest = depth;
      }
    }
    if (winner) {
      winner.r = mergedRadius(winner.r, item.r, 0.92);
      game.food[index] = makeFood(game.nextId++);
    }
  }
}

export function resolveOrbs(game: GameData) {
  const entities = [...game.player, ...game.bots.filter((bot) => bot.alive)];
  const candidates: Array<{ predator: Orb; prey: Orb; depth: number }> = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const a = entities[i];
      const b = entities[j];
      if (a.owner === b.owner) continue;
      if (canConsume(a, b)) {
        candidates.push({ predator: a, prey: b, depth: a.r - Math.hypot(a.x - b.x, a.y - b.y) });
      } else if (canConsume(b, a)) {
        candidates.push({ predator: b, prey: a, depth: b.r - Math.hypot(a.x - b.x, a.y - b.y) });
      }
    }
  }
  candidates.sort((a, b) => b.depth - a.depth || b.predator.r - a.predator.r);
  const consumed = new Set<number>();
  for (const { predator, prey } of candidates) {
    if (consumed.has(predator.id) || consumed.has(prey.id) || !predator.alive || !prey.alive) continue;
    predator.r = mergedRadius(predator.r, prey.r, 0.88);
    consumed.add(prey.id);
    if (prey.kind === "player") game.player = game.player.filter((cell) => cell.id !== prey.id);
    else {
      prey.alive = false;
      prey.respawnAt = game.elapsed + 2.4;
    }
  }
  return !game.player.length;
}

export function updateCamera(game: GameData, dt: number) {
  if (!game.player.length) return;
  const totalMass = game.player.reduce((sum, cell) => sum + massFromRadius(cell.r), 0);
  const center = game.player.reduce(
    (acc, cell) => {
      const mass = massFromRadius(cell.r);
      acc.x += (cell.x * mass) / totalMass;
      acc.y += (cell.y * mass) / totalMass;
      return acc;
    },
    { x: 0, y: 0 },
  );
  const equivalentRadius = radiusFromMass(totalMass);
  const targetZoom = Math.max(0.42, Math.min(1.08, 44 / equivalentRadius));
  const follow = 1 - Math.exp(-5 * dt);
  game.camera.x += (center.x - game.camera.x) * follow;
  game.camera.y += (center.y - game.camera.y) * follow;
  game.camera.zoom += (targetZoom - game.camera.zoom) * follow;
}
