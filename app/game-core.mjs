export const WORLD_SIZE = 3200;
export const EAT_RATIO = 1.12;

export function massFromRadius(radius) {
  return radius * radius;
}

export function radiusFromMass(mass) {
  return Math.sqrt(Math.max(0, mass));
}

export function speedForRadius(radius) {
  return Math.max(72, Math.min(225, 224 * Math.sqrt(24 / Math.max(radius, 1))));
}

export function canConsume(predator, prey) {
  if (!predator || !prey || predator === prey || predator.alive === false || prey.alive === false) return false;
  if (predator.r < prey.r * EAT_RATIO) return false;
  const distance = Math.hypot(predator.x - prey.x, predator.y - prey.y);
  return distance < predator.r - prey.r * 0.35;
}

export function mergedRadius(firstRadius, secondRadius, efficiency = 1) {
  return radiusFromMass(massFromRadius(firstRadius) + massFromRadius(secondRadius) * efficiency);
}

export function clampToWorld(ball, worldSize = WORLD_SIZE) {
  ball.x = Math.max(ball.r, Math.min(worldSize - ball.r, ball.x));
  ball.y = Math.max(ball.r, Math.min(worldSize - ball.r, ball.y));
  return ball;
}

export function scoreForCells(cells) {
  return Math.round(cells.reduce((total, cell) => total + massFromRadius(cell.r), 0));
}

export function buildLeaderboard(playerCells, bots) {
  const entries = bots
    .filter((bot) => bot.alive !== false)
    .map((bot) => ({ id: bot.owner, name: bot.name, score: Math.round(massFromRadius(bot.r)), player: false }));
  entries.push({ id: "player", name: "你", score: scoreForCells(playerCells), player: true });
  return entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
}
