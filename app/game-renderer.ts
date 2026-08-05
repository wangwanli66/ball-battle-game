import { WORLD_SIZE, massFromRadius } from "./game-core.mjs";
import type { Food, GameData, Orb } from "./game-types";

export type GameRenderer = {
  resize: () => void;
  draw: (game: GameData, localOwner?: string) => void;
};

export function createGameRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): GameRenderer {
  let viewWidth = 1;
  let viewHeight = 1;
  let dpr = 1;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    viewWidth = Math.max(1, rect.width);
    viewHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewWidth * dpr);
    canvas.height = Math.round(viewHeight * dpr);
  };

  const drawGrid = (game: GameData) => {
    ctx.fillStyle = "#07131e";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    ctx.save();
    ctx.translate(viewWidth / 2, viewHeight / 2);
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);

    const left = game.camera.x - viewWidth / game.camera.zoom / 2;
    const right = game.camera.x + viewWidth / game.camera.zoom / 2;
    const top = game.camera.y - viewHeight / game.camera.zoom / 2;
    const bottom = game.camera.y + viewHeight / game.camera.zoom / 2;
    ctx.strokeStyle = "rgba(107, 224, 255, 0.075)";
    ctx.lineWidth = 1 / game.camera.zoom;
    ctx.beginPath();
    const grid = 90;
    for (let x = Math.floor(left / grid) * grid; x <= right; x += grid) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / grid) * grid; y <= bottom; y += grid) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(124, 246, 199, 0.55)";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.restore();
  };

  const drawFood = (item: Food) => {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawOrb = (orb: Orb, localOwner: string, elapsed: number) => {
    if (!orb.alive) return;
    const isLocal = orb.kind === "player" && orb.owner === localOwner;
    ctx.save();
    if (orb.boosting) {
      const pulse = 4 + Math.sin(elapsed * 18 + orb.id) * 2;
      ctx.strokeStyle = "rgba(255, 209, 102, .82)";
      ctx.lineWidth = Math.max(2, orb.r * 0.07);
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const gradient = ctx.createRadialGradient(
      orb.x - orb.r * 0.32,
      orb.y - orb.r * 0.35,
      orb.r * 0.08,
      orb.x,
      orb.y,
      orb.r,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.09, orb.color);
    gradient.addColorStop(1, `${orb.color}bb`);
    ctx.fillStyle = gradient;
    ctx.shadowColor = isLocal ? "#67ffd0" : orb.color;
    ctx.shadowBlur = isLocal ? 22 : 12;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isLocal ? "rgba(230,255,247,.92)" : "rgba(255,255,255,.42)";
    ctx.lineWidth = Math.max(1.4, orb.r * 0.055);
    ctx.stroke();
    if (orb.r > 15) {
      ctx.fillStyle = "rgba(4, 15, 26, .86)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.max(11, Math.min(20, orb.r * 0.52))}px system-ui`;
      ctx.fillText(orb.name, orb.x, orb.y - (orb.r > 31 ? 4 : 0));
      if (orb.r > 31) {
        ctx.font = `700 ${Math.max(9, orb.r * 0.28)}px system-ui`;
        ctx.fillStyle = "rgba(4, 15, 26, .62)";
        ctx.fillText(String(Math.round(massFromRadius(orb.r))), orb.x, orb.y + orb.r * 0.32);
      }
    }
    ctx.restore();
  };

  const draw = (game: GameData, localOwner = "player") => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    drawGrid(game);
    ctx.save();
    ctx.translate(viewWidth / 2, viewHeight / 2);
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);
    for (const item of game.food) drawFood(item);
    const drawOrder = [...game.bots.filter((bot) => bot.alive), ...game.player].sort((a, b) => a.r - b.r);
    for (const orb of drawOrder) drawOrb(orb, localOwner, game.elapsed);
    ctx.restore();
  };

  return { resize, draw };
}
