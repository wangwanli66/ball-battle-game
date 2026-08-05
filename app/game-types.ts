export type Phase = "ready" | "playing" | "paused" | "gameover";

export type OrbKind = "player" | "bot";

export type Orb = {
  id: number;
  owner: string;
  kind: OrbKind;
  name: string;
  x: number;
  y: number;
  r: number;
  color: string;
  alive: boolean;
  impulseX: number;
  impulseY: number;
  dirX: number;
  dirY: number;
  targetX: number;
  targetY: number;
  thinkAt: number;
  mergeAt: number;
  respawnAt: number;
};

export type Food = {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
};

export type GameData = {
  phase: Phase;
  player: Orb[];
  bots: Orb[];
  food: Food[];
  camera: { x: number; y: number; zoom: number };
  elapsed: number;
  lastSplit: number;
  nextId: number;
};

export type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

export type Leader = {
  name: string;
  score: number;
  player: boolean;
};

export type GameActions = {
  start: () => void;
  pause: () => void;
  restart: () => void;
  split: () => void;
};

export type GameActionsRef = { current: GameActions };
