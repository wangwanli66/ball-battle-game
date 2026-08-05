export const WORLD_SIZE = 3200;
export const EAT_RATIO = 1.12;
export const BOOST_SPEED_MULTIPLIER = 1.45;
export const BOOST_MIN_RADIUS = 16;
export const BOOST_MASS_DECAY_PER_SECOND = 0.10;

export function massFromRadius(radius) {
  return radius * radius;
}

export function radiusFromMass(mass) {
  return Math.sqrt(Math.max(0, mass));
}

export function boostMassAvailable(cells) {
  const minimumMass = massFromRadius(BOOST_MIN_RADIUS);
  return cells.reduce(
    (total, cell) => total + Math.max(0, massFromRadius(cell.r) - minimumMass),
    0,
  );
}

export function consumeBoostMass(cells, dt) {
  const availableBefore = boostMassAvailable(cells);
  if (!(dt > 0) || availableBefore <= 0) {
    return { consumed: 0, intensity: 0, available: availableBefore };
  }

  const totalMass = cells.reduce((total, cell) => total + massFromRadius(cell.r), 0);
  const requested = totalMass * (1 - Math.exp(-BOOST_MASS_DECAY_PER_SECOND * dt));
  if (!(requested > 0)) {
    return { consumed: 0, intensity: 0, available: availableBefore };
  }

  const consumed = Math.min(requested, availableBefore);
  const minimumMass = massFromRadius(BOOST_MIN_RADIUS);
  for (const cell of cells) {
    const mass = massFromRadius(cell.r);
    const cellAvailable = Math.max(0, mass - minimumMass);
    if (cellAvailable <= 0) continue;
    const share = cellAvailable / availableBefore;
    cell.r = radiusFromMass(Math.max(minimumMass, mass - consumed * share));
  }

  return {
    consumed,
    intensity: Math.min(1, consumed / requested),
    available: Math.max(0, availableBefore - consumed),
  };
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

export function scoreForOwner(cells, owner = "player") {
  return scoreForCells(cells.filter((cell) => (cell.owner ?? "player") === owner));
}

export function buildLeaderboard(playerCells, bots, localOwner = "player") {
  const humanEntries = new Map();
  for (const cell of playerCells) {
    const owner = cell.owner ?? "player";
    const current = humanEntries.get(owner) ?? {
      id: owner,
      name: cell.name ?? (owner === "player" ? "你" : "好友"),
      score: 0,
      player: owner === localOwner,
    };
    current.score += massFromRadius(cell.r);
    humanEntries.set(owner, current);
  }

  const entries = bots
    .filter((bot) => bot.alive !== false)
    .map((bot) => ({ id: bot.owner, name: bot.name, score: Math.round(massFromRadius(bot.r)), player: false }));
  for (const entry of humanEntries.values()) {
    entries.push({ ...entry, score: Math.round(entry.score) });
  }
  if (!humanEntries.has(localOwner)) {
    entries.push({ id: localOwner, name: localOwner === "player" ? "你" : "重组中", score: 0, player: true });
  }
  return entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
}
