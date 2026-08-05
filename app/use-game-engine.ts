"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { buildLeaderboard, scoreForCells } from "./game-core.mjs";
import { createGameRenderer } from "./game-renderer";
import {
  resolveFood,
  resolveOrbs,
  splitPlayer,
  updateBots,
  updateCamera,
  updatePlayer,
} from "./game-simulation";
import { createGame } from "./game-state";
import type { GameActions, Leader, Phase, PointerState } from "./game-types";

type PointerRef = { current: PointerState };

const emptyActions: GameActions = {
  start: () => {},
  pause: () => {},
  restart: () => {},
  split: () => {},
};

export function useGameEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  pointerRef: PointerRef,
) {
  const actions = useRef<GameActions>(emptyActions);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(729);
  const [rank, setRank] = useState(1);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [fragments, setFragments] = useState(1);

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

    const syncPhase = (next: Phase) => {
      game.phase = next;
      setPhase(next);
      lastFrame = performance.now();
    };

    const updateHud = (force = false) => {
      if (!force && game.elapsed - lastHud < 0.18) return;
      lastHud = game.elapsed;
      const board = buildLeaderboard(game.player, game.bots) as Leader[];
      const playerIndex = board.findIndex((item) => item.player);
      setScore(scoreForCells(game.player));
      setRank(playerIndex + 1);
      setLeaders(board.slice(0, 6));
      setFragments(game.player.length);
    };

    const restart = () => {
      game = createGame();
      pointerRef.current = { x: 0, y: 0, active: false };
      syncPhase("ready");
      updateHud(true);
    };

    const start = () => {
      if (game.phase === "ready" || game.phase === "paused") syncPhase("playing");
      else if (game.phase === "gameover") restart();
    };

    const pause = () => {
      if (game.phase === "playing") syncPhase("paused");
      else if (game.phase === "paused") syncPhase("playing");
    };

    const split = () => {
      if (splitPlayer(game, pointerRef.current)) updateHud(true);
    };

    actions.current = { start, pause, restart, split };

    const frame = (now: number) => {
      const rawDt = (now - lastFrame) / 1000;
      lastFrame = now;
      const dt = Math.min(0.05, Math.max(0, rawDt));
      if (game.phase === "playing") {
        game.elapsed += dt;
        updatePlayer(game, pointerRef.current, dt);
        updateBots(game, dt);
        resolveFood(game);
        if (resolveOrbs(game)) syncPhase("gameover");
        updateCamera(game, dt);
        updateHud();
      } else {
        updateCamera(game, Math.min(dt, 0.016));
      }
      renderer.draw(game);
      animationFrame = requestAnimationFrame(frame);
    };

    const onKeyDown = (event: KeyboardEvent) => {
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

    renderer.resize();
    updateHud(true);
    window.addEventListener("resize", renderer.resize);
    window.addEventListener("keydown", onKeyDown);
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", renderer.resize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasRef, pointerRef]);

  return { actions, phase, score, rank, leaders, fragments };
}
