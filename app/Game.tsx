"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { GameHud } from "./GameHud";
import type { PointerState } from "./game-types";
import { useGameEngine } from "./use-game-engine";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, active: false });
  const {
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
  } = useGameEngine(canvasRef, pointerRef);

  const updatePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
      active: true,
    };
    if (event.pointerType === "touch") event.preventDefault();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);
    if (phase === "ready") actions.current.start();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") pointerRef.current = { x: 0, y: 0, active: false };
  };

  return (
    <main className="arena-shell">
      <canvas
        ref={canvasRef}
        className="arena-canvas"
        aria-label="球球大作战游戏区域"
        onPointerMove={updatePointer}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <GameHud
        actions={actions}
        phase={phase}
        score={score}
        rank={rank}
        leaders={leaders}
        fragments={fragments}
        boosting={boosting}
        canBoost={canBoost}
        canControlMatch={party.role !== "guest"}
        respawning={respawning}
        party={party}
        onCreateRoom={(name) => void partyActions.current.create(name)}
        onJoinRoom={(request) => void partyActions.current.join(request)}
        onLeaveRoom={() => partyActions.current.leave()}
      />
    </main>
  );
}
