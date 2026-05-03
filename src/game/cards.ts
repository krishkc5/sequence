import { Card, RANKS, Rank, SUITS, Suit } from "../types";

export const suitSymbols: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣"
};

export const suitNames: Record<Suit, string> = {
  spades: "Spades",
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs"
};

export const rankValues: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13
};

export function cardLabel(card: Card): string {
  if (card.rank === "JOKER") {
    return "Joker";
  }

  return `${card.rank}${card.suit ? suitSymbols[card.suit] : ""}`;
}

export function cardLongLabel(card: Card): string {
  if (card.rank === "JOKER") {
    return "Printed Joker";
  }

  return `${card.rank} of ${card.suit ? suitNames[card.suit] : "Unknown"}`;
}

export function isRed(card: Card): boolean {
  return card.suit === "hearts" || card.suit === "diamonds";
}

export function isPrintedJoker(card: Card): card is Card & { rank: "JOKER" } {
  return card.rank === "JOKER";
}

export function isWild(card: Card, wildRank: Rank | null): boolean {
  return isPrintedJoker(card) || (!!wildRank && card.rank === wildRank);
}

export function scoreCard(card: Card, wildRank: Rank | null): number {
  if (isWild(card, wildRank)) {
    return 0;
  }

  if (card.rank === "A" || card.rank === "J" || card.rank === "Q" || card.rank === "K") {
    return 10;
  }

  return Number(card.rank);
}

export function buildDeck(playerCount: number): Card[] {
  const deckCount = playerCount >= 6 ? 3 : 2;
  const cards: Card[] = [];

  for (let deck = 1; deck <= deckCount; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          uid: `${deck}-${suit}-${rank}`,
          deck,
          suit,
          rank
        });
      }
    }

    cards.push({
      uid: `${deck}-joker-1`,
      deck,
      suit: null,
      rank: "JOKER",
      jokerIndex: 1
    });
    cards.push({
      uid: `${deck}-joker-2`,
      deck,
      suit: null,
      rank: "JOKER",
      jokerIndex: 2
    });
  }

  return cards;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.rank === "JOKER" && b.rank !== "JOKER") {
      return 1;
    }
    if (b.rank === "JOKER" && a.rank !== "JOKER") {
      return -1;
    }
    if (a.suit !== b.suit) {
      return String(a.suit).localeCompare(String(b.suit));
    }
    return rankOrder(a) - rankOrder(b);
  });
}

export function rankOrder(card: Card): number {
  if (card.rank === "JOKER") {
    return 99;
  }

  if (card.rank === "A") {
    return 1;
  }

  return rankValues[card.rank];
}

export function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

export function cardIds(cards: Card[]): string[] {
  return cards.map((card) => card.uid);
}
