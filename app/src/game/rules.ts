import { Card, HudGroups, Rank, RoundState, ScoreGroup } from "../types";
import { isPrintedJoker, isWild, rankValues } from "./cards";

export interface ValidationResult {
  valid: boolean;
  message: string;
  groups: ScoreGroup[];
}

function rankOptions(card: Card): number[] {
  if (card.rank === "JOKER") {
    return [];
  }

  if (card.rank === "A") {
    return [1, 14];
  }

  return [rankValues[card.rank]];
}

function expandRankAssignments(cards: Card[]): number[][] {
  let assignments: number[][] = [[]];

  for (const card of cards) {
    const options = rankOptions(card);
    assignments = assignments.flatMap((assignment) =>
      options.map((option) => [...assignment, option])
    );
  }

  return assignments;
}

function valuesFitRun(values: number[], runLength: number): boolean {
  if (new Set(values).size !== values.length) {
    return false;
  }

  const minStart = 1;
  const maxStart = 14 - runLength + 1;

  for (let start = minStart; start <= maxStart; start += 1) {
    const end = start + runLength - 1;
    if (values.every((value) => value >= start && value <= end)) {
      return true;
    }
  }

  return false;
}

export function validateNaturalSequence(cards: Card[]): boolean {
  if (cards.length < 3 || cards.some(isPrintedJoker)) {
    return false;
  }

  const suit = cards[0]?.suit;
  if (!suit || cards.some((card) => card.suit !== suit)) {
    return false;
  }

  return expandRankAssignments(cards).some((assignment) =>
    valuesFitRun(assignment, cards.length)
  );
}

export function validateWildSequence(cards: Card[], wildRank: Rank | null): boolean {
  if (cards.length < 3) {
    return false;
  }

  const realCards = cards.filter((card) => !isWild(card, wildRank));

  if (realCards.length === 0) {
    return true;
  }

  const suit = realCards[0]?.suit;
  if (!suit || realCards.some((card) => card.suit !== suit)) {
    return false;
  }

  return expandRankAssignments(realCards).some((assignment) =>
    valuesFitRun(assignment, cards.length)
  );
}

export function validateSet(cards: Card[], wildRank: Rank | null): boolean {
  if (cards.length < 3) {
    return false;
  }

  const realCards = cards.filter((card) => !isWild(card, wildRank));
  if (realCards.length === 0) {
    return true;
  }

  const rank = realCards[0]?.rank;
  return realCards.every((card) => card.rank === rank);
}

export function cardsForIds(cards: Card[], ids: string[]): Card[] {
  const lookup = new Map(cards.map((card) => [card.uid, card]));
  return ids.map((id) => lookup.get(id)).filter((card): card is Card => !!card);
}

export function groupCards(hand: Card[], groups: HudGroups): Record<keyof HudGroups, Card[]> {
  return {
    ungrouped: cardsForIds(hand, groups.ungrouped),
    natural: cardsForIds(hand, groups.natural),
    sequence: cardsForIds(hand, groups.sequence),
    final: cardsForIds(hand, groups.final)
  };
}

export function resolvePlayerWildRank(round: RoundState, playerId: string): Rank | null {
  if (round.config.kind === "chosen") {
    return round.selectedJokers[playerId] ?? "A";
  }

  if (round.config.kind === "secret") {
    const secretCard = round.secretCard;
    if (!round.secretSeen[playerId] || !secretCard || isPrintedJoker(secretCard)) {
      return null;
    }

    return secretCard.rank as Rank;
  }

  return null;
}

export function resolveScoringWildRank(round: RoundState): Rank | null {
  if (round.config.kind === "chosen") {
    return round.winnerJokerRank;
  }

  if (round.config.kind === "secret") {
    const secretCard = round.secretCard;
    if (!secretCard || isPrintedJoker(secretCard)) {
      return null;
    }

    return secretCard.rank as Rank;
  }

  return null;
}

export function validateDeclaredHand(
  hand: Card[],
  discardUid: string,
  groups: HudGroups,
  wildRank: Rank | null
): ValidationResult {
  const groupedIds = [
    ...groups.natural,
    ...groups.sequence,
    ...groups.final
  ];
  const uniqueGroupedIds = new Set(groupedIds);
  const handIds = new Set(hand.map((card) => card.uid));

  if (uniqueGroupedIds.size !== groupedIds.length) {
    return { valid: false, message: "A card is used in more than one group.", groups: [] };
  }

  if (groupedIds.some((id) => !handIds.has(id))) {
    return { valid: false, message: "A grouped card is no longer in hand.", groups: [] };
  }

  if (uniqueGroupedIds.has(discardUid)) {
    return {
      valid: false,
      message: "The face-down discard cannot also be part of the made hand.",
      groups: []
    };
  }

  if (groupedIds.length !== 10) {
    return {
      valid: false,
      message: "Exactly 10 cards must be arranged into the three groups.",
      groups: []
    };
  }

  const grouped = groupCards(hand, groups);
  const naturalValid = validateNaturalSequence(grouped.natural);
  const sequenceValid = validateWildSequence(grouped.sequence, wildRank);
  const finalValid =
    validateWildSequence(grouped.final, wildRank) || validateSet(grouped.final, wildRank);

  const scoreGroups: ScoreGroup[] = [
    {
      label: "Natural sequence",
      kind: "natural",
      cards: grouped.natural,
      valid: naturalValid
    },
    {
      label: "Sequence",
      kind: "sequence",
      cards: grouped.sequence,
      valid: sequenceValid
    },
    {
      label: "Sequence or set",
      kind: "final",
      cards: grouped.final,
      valid: finalValid
    }
  ];

  if (!naturalValid) {
    return { valid: false, message: "The first group must be a natural sequence.", groups: scoreGroups };
  }

  if (!sequenceValid) {
    return { valid: false, message: "The second group must be a valid sequence.", groups: scoreGroups };
  }

  if (!finalValid) {
    return { valid: false, message: "The final group must be a valid sequence or set.", groups: scoreGroups };
  }

  return { valid: true, message: "Made hand is valid.", groups: scoreGroups };
}
