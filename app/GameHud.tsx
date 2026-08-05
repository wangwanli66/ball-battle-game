"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import PartyPanel, { type PartyState } from "./PartyPanel";
import type { GameActionsRef, Leader, Phase } from "./game-types";

type GameHudProps = {
  actions: GameActionsRef;
  phase: Phase;
  score: number;
  rank: number;
  leaders: Leader[];
  fragments: number;
  boosting: boolean;
  canBoost: boolean;
  canControlMatch: boolean;
  respawning: boolean;
  party: PartyState;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (request: { name: string; roomCode: string; secret: string }) => void;
  onLeaveRoom: () => void;
};

export function GameHud({
  actions,
  phase,
  score,
  rank,
  leaders,
  fragments,
  boosting,
  canBoost,
  canControlMatch,
  respawning,
  party,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}: GameHudProps) {
  const [partyOpen, setPartyOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.hash.includes("room=")) setPartyOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const overlayTitle = phase === "ready"
    ? canControlMatch ? "吞噬 · 成长 · 称霸星海" : "等待房主开启星海"
    : phase === "paused" ? "时空已暂停" : "你被吞噬了";
  const overlayText = phase === "ready"
    ? canControlMatch
      ? "移动指针引导球球，吞下光点和更小的对手。按住加速会获得爆发速度，但会持续消耗体型。"
      : "已进入好友房间。房主开始后，你会在同一片星域出生。"
    : phase === "paused"
      ? canControlMatch ? "所有球球都已冻结，再次点击即可继续。" : "房主暂停了本局游戏。"
      : `本局最终质量 ${score} · 排名第 ${rank}`;

  const stopBoost = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    actions.current.setBoosting(false);
  };

  const startBoost = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!canBoost || phase !== "playing") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    actions.current.setBoosting(true);
  };

  return (
    <>
      <header className="brand-bar">
        <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <div><p className="eyebrow">ORBIT ARENA</p><h1>球球星域</h1></div>
      </header>

      <button
        className={`party-toggle ${party.role !== "offline" ? "is-online" : ""}`}
        type="button"
        onClick={() => setPartyOpen((open) => !open)}
        aria-expanded={partyOpen}
        aria-controls="party-drawer"
      >
        <span aria-hidden="true">◎</span>
        {party.role === "offline" ? "好友开黑" : `${party.roomCode} · ${party.peerCount}人`}
      </button>

      {partyOpen && (
        <div className="party-drawer" id="party-drawer">
          <button className="party-close" type="button" onClick={() => setPartyOpen(false)} aria-label="关闭好友房间面板">×</button>
          <PartyPanel party={party} onCreate={onCreateRoom} onJoin={onJoinRoom} onLeave={onLeaveRoom} />
        </div>
      )}

      <section className="stats" aria-label="游戏数据">
        <div><span>质量</span><strong>{score.toLocaleString()}</strong></div>
        <div><span>排名</span><strong>#{rank}</strong></div>
        <div><span>分身</span><strong>{fragments}/8</strong></div>
        <div className="boost-stat"><span>推进</span><strong>{boosting ? "加速中" : canBoost ? "可用" : "不足"}</strong></div>
      </section>

      <aside className="leaderboard" aria-label="实时排行榜">
        <div className="leaderboard-title"><span>实时排行</span><b>{party.role === "offline" ? "LIVE" : "PARTY"}</b></div>
        <ol>
          {leaders.map((leader, index) => (
            <li className={leader.player ? "is-player" : ""} key={`${leader.name}-${index}`}>
              <span className="place">{String(index + 1).padStart(2, "0")}</span>
              <span className="leader-name">{leader.name}</span>
              <span className="leader-score">{leader.score}</span>
            </li>
          ))}
        </ol>
        {!leaders.some((leader) => leader.player) && <p className="your-rank">你的排名 #{rank}</p>}
      </aside>

      <div className="action-dock">
        <button
          className={`round-action boost-action ${boosting ? "is-active" : ""} ${!canBoost ? "is-exhausted" : ""}`}
          type="button"
          onPointerDown={startBoost}
          onPointerUp={stopBoost}
          onPointerCancel={stopBoost}
          onLostPointerCapture={() => actions.current.setBoosting(false)}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="按住消耗体型加速"
          aria-pressed={boosting}
          aria-disabled={!canBoost}
        >
          <span className="boost-icon" aria-hidden="true">»</span><small>按住加速</small><kbd>SHIFT</kbd>
        </button>
        <button className="round-action split-action" type="button" onClick={() => actions.current.split()} aria-label="分裂球球">
          <span className="split-icon"><i /><i /></span><small>分裂</small><kbd>SPACE</kbd>
        </button>
        <button
          className="round-action pause-action"
          type="button"
          onClick={() => actions.current.pause()}
          aria-label={phase === "paused" ? "继续游戏" : "暂停游戏"}
          aria-disabled={!canControlMatch}
        >
          <span className="pause-icon">{phase === "paused" ? "▶" : "Ⅱ"}</span>
          <small>{phase === "paused" ? "继续" : "暂停"}</small><kbd>P</kbd>
        </button>
      </div>

      {respawning && <div className="respawn-banner" role="status">球球正在重组，马上回到战场…</div>}

      {phase !== "playing" && (
        <section className="game-overlay" role="dialog" aria-label={overlayTitle}>
          <div className="overlay-orb" aria-hidden="true"><i /><i /><i /></div>
          <p className="eyebrow">ORBIT PROTOCOL</p>
          <h2>{overlayTitle}</h2>
          <p>{overlayText}</p>
          <button
            type="button"
            disabled={!canControlMatch}
            onClick={() => {
              if (phase === "gameover") actions.current.restart();
              actions.current.start();
            }}
          >
            {canControlMatch
              ? phase === "ready" ? "进入星海" : phase === "paused" ? "继续游戏" : "再次出发"
              : "等待房主"}<span>→</span>
          </button>
          {phase === "ready" && (
            <div className="control-hint">
              <span>移动鼠标 / 单指拖动</span><span>按住 Shift 消耗体型加速</span><span>空格键分裂</span><span>P 键暂停</span>
            </div>
          )}
        </section>
      )}

      <div className="edge-tip">吞噬 AI · 队友互不吞噬 · 远离更大的球</div>
    </>
  );
}
