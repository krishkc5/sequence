export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
] as const;
export type Rank = (typeof RANKS)[number];

export type DrawSource = "deck" | "discard";
export type RoomPhase = "lobby" | "playing" | "scoring" | "complete";
export type RoundKind = "normal" | "secret" | "chosen";
export type GroupKind = "natural" | "sequence" | "final";

export interface Card {
  uid: string;
  deck: number;
  suit: Suit | null;
  rank: Rank | "JOKER";
  jokerIndex?: number;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  totalScore: number;
  roundScores: number[];
  joinedAt: number;
}

export interface TimerSettings {
  enabled: boolean;
  seconds: number;
}

export interface HudGroups {
  ungrouped: string[];
  natural: string[];
  sequence: string[];
  final: string[];
}

export interface RoundConfig {
  index: number;
  label: string;
  kind: RoundKind;
  doubleLoserScore: boolean;
}

export interface TurnState {
  drawn: boolean;
  startedAt: number;
  drawnCardUid: string | null;
}

export interface DeclaredState {
  playerId: string;
  discard: Card;
  groups: HudGroups;
  declaredAt: number;
}

export interface ScoreGroup {
  label: string;
  kind: GroupKind;
  cards: Card[];
  valid: boolean;
}

export interface ScoreBreakdown {
  playerId: string;
  score: number;
  rawScore: number;
  multiplier: number;
  groups: ScoreGroup[];
  leftovers: Card[];
  confirmed: boolean;
}

export interface RoundState {
  index: number;
  config: RoundConfig;
  dealerId: string;
  currentPlayerId: string;
  deck: Card[];
  discardPile: Card[];
  hands: Record<string, Card[]>;
  turn: TurnState;
  secretCard: Card | null;
  secretRevealed: boolean;
  secretSeen: Record<string, boolean>;
  selectedJokers: Record<string, Rank>;
  declared: DeclaredState | null;
  winnerJokerRank: Rank | null;
  scoring: Record<string, ScoreBreakdown>;
}

export interface RoundRecord {
  roundIndex: number;
  label: string;
  winnerId: string;
  scores: Record<string, number>;
}

export interface GameRoom {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: Player[];
  settings: {
    timer: TimerSettings;
  };
  round: RoundState | null;
  history: RoundRecord[];
  createdAt: number;
  updatedAt: number;
}
