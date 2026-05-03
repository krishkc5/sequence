import { describe, expect, it } from "vitest";
import { Card } from "../types";
import { buildDeck } from "./cards";
import {
  validateNaturalSequence,
  validateSet,
  validateWildSequence
} from "./rules";
import { suggestBestScore } from "./score";

function c(uid: string, rank: Card["rank"], suit: Card["suit"]): Card {
  return { uid, rank, suit, deck: 1 };
}

describe("sequence rules", () => {
  it("allows aces low or high but not wraparound", () => {
    expect(
      validateNaturalSequence([
        c("a", "A", "hearts"),
        c("2", "2", "hearts"),
        c("3", "3", "hearts")
      ])
    ).toBe(true);
    expect(
      validateNaturalSequence([
        c("q", "Q", "spades"),
        c("k", "K", "spades"),
        c("a", "A", "spades")
      ])
    ).toBe(true);
    expect(
      validateNaturalSequence([
        c("k", "K", "clubs"),
        c("a", "A", "clubs"),
        c("2", "2", "clubs")
      ])
    ).toBe(false);
  });

  it("keeps natural sequences free of joker substitution", () => {
    expect(
      validateNaturalSequence([
        c("4", "4", "diamonds"),
        c("joker", "JOKER", null),
        c("6", "6", "diamonds")
      ])
    ).toBe(false);
    expect(
      validateWildSequence(
        [c("4", "4", "diamonds"), c("joker", "JOKER", null), c("6", "6", "diamonds")],
        null
      )
    ).toBe(true);
  });

  it("allows all-joker non-natural groups", () => {
    const jokers = [
      c("j1", "JOKER", null),
      c("j2", "JOKER", null),
      c("j3", "JOKER", null)
    ];
    expect(validateWildSequence(jokers, null)).toBe(true);
    expect(validateSet(jokers, null)).toBe(true);
  });

  it("allows duplicate suits in sets across decks", () => {
    expect(
      validateSet(
        [
          c("8h-1", "8", "hearts"),
          c("8h-2", "8", "hearts"),
          c("8s", "8", "spades")
        ],
        null
      )
    ).toBe(true);
  });

  it("scores active jokers as zero and preserves ordered groups", () => {
    const hand = [
      c("3h", "3", "hearts"),
      c("4h", "4", "hearts"),
      c("5h", "5", "hearts"),
      c("7s", "7", "spades"),
      c("8s", "8", "spades"),
      c("j", "JOKER", null),
      c("kh", "K", "hearts"),
      c("kd", "K", "diamonds"),
      c("8c", "8", "clubs"),
      c("2d", "2", "diamonds")
    ];
    const score = suggestBestScore("p1", hand, "8", 1);
    expect(score.score).toBe(2);
    expect(score.groups).toHaveLength(3);
    expect(score.leftovers.map((card) => card.uid)).toEqual(["2d"]);
  });

  it("builds 2 decks under 6 players and 3 decks for 6 or more", () => {
    expect(buildDeck(5)).toHaveLength(108);
    expect(buildDeck(6)).toHaveLength(162);
  });
});
