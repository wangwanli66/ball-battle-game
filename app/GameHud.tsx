import type { GameActionsRef, Leader, Phase } from "./game-types";

type GameHudProps = {
  actions: GameActionsRef;
  phase: Phase;
  score: number;
  rank: number;
  leaders: Leader[];
  fragments: number;
};

export function GameHud({ actions, phase, score, rank, leaders, fragments }: GameHudProps) {
  const overlayTitle = phase === "ready" ? "吞噬 · 成长 · 称霸星海" : phase === "paused" ? "时空已暂停" : "你被吞噬了";
  const overlayText = phase === "ready"
    ? "移动指针引导球球，吞下光点和更小的对手。体积越大，速度越慢。"
    : phase === "paused"
      ? "你的球球和所有对手都已冻结"
      : `本局最终质量 ${score} · 排名第 ${rank}`;

  return (
    <>
      <header className="brand-bar">
        <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <div><p className="eyebrow">ORBIT ARENA</p><h1>球球星域</h1></div>
      </header>

      <section className="stats" aria-label="游戏数据">
        <div><span>质量</span><strong>{score.toLocaleString()}</strong></div>
        <div><span>排名</span><strong>#{rank}</strong></div>
        <div><span>分身</span><strong>{fragments}/8</strong></div>
      </section>

      <aside className="leaderboard" aria-label="实时排行榜">
        <div className="leaderboard-title"><span>实时排行</span><b>LIVE</b></div>
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
        <button className="round-action split-action" type="button" onClick={() => actions.current.split()} aria-label="分裂球球">
          <span className="split-icon"><i /><i /></span><small>分裂</small><kbd>SPACE</kbd>
        </button>
        <button
          className="round-action pause-action"
          type="button"
          onClick={() => actions.current.pause()}
          aria-label={phase === "paused" ? "继续游戏" : "暂停游戏"}
        >
          <span className="pause-icon">{phase === "paused" ? "▶" : "Ⅱ"}</span>
          <small>{phase === "paused" ? "继续" : "暂停"}</small><kbd>P</kbd>
        </button>
      </div>

      {phase !== "playing" && (
        <section className="game-overlay" role="dialog" aria-label={overlayTitle}>
          <div className="overlay-orb" aria-hidden="true"><i /><i /><i /></div>
          <p className="eyebrow">ORBIT PROTOCOL</p>
          <h2>{overlayTitle}</h2>
          <p>{overlayText}</p>
          <button type="button" onClick={() => {
            if (phase === "gameover") actions.current.restart();
            actions.current.start();
          }}>
            {phase === "ready" ? "进入星海" : phase === "paused" ? "继续游戏" : "再次出发"}<span>→</span>
          </button>
          {phase === "ready" && (
            <div className="control-hint">
              <span>移动鼠标 / 单指拖动</span><span>空格键分裂</span><span>P 键暂停</span>
            </div>
          )}
        </section>
      )}

      <div className="edge-tip">吞噬更小的球 · 远离更大的球</div>
    </>
  );
}
