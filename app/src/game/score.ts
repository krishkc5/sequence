import { Card, GroupKind, HudGroups, Rank, ScoreBreakdown, ScoreGroup } from "../types";
import { scoreCard } from "./cards";
import {
  groupCards,
  validateNaturalSequence,
  validateSet,
  validateWildSequence
} from "./rules";

interface Candidate {
  mask: number;
  kind: GroupKind;
  label: string;
  cards: Card[];
}

function cardMask(indexes: number[]): number {
  return indexes.reduce((mask, index) => mask | (1 << index), 0);
}

function indexesFromMask(mask: number, size: number): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < size; index += 1) {
    if (mask & (1 << index)) {
      indexes.push(index);
    }
  }
  return indexes;
}

function generateCandidates(hand: Card[], wildRank: Rank | null): Candidate[] {
  const candidates: Candidate[] = [];
  const limit = 1 << hand.length;

  for (let mask = 1; mask < limit; mask += 1) {
    const indexes = indexesFromMask(mask, hand.length);
    if (indexes.length < 3) {
      continue;
    }

    const cards = indexes.map((index) => hand[index]);

    if (validateNaturalSequence(cards)) {
      candidates.push({
        mask,
        kind: "natural",
        label: "Natural sequence",
        cards
      });
    }

    if (validateWildSequence(cards, wildRank)) {
      candidates.push({
        mask,
        kind: "sequence",
        label: "Sequence",
        cards
      });
    }

    if (validateWildSequence(cards, wildRank) || validateSet(cards, wildRank)) {
      candidates.push({
        mask,
        kind: "final",
        label: "Sequence or set",
        cards
      });
    }
  }

  return candidates;
}

function scoreForMask(
  playerId: string,
  hand: Card[],
  usedMask: number,
  groups: ScoreGroup[],
  wildRank: Rank | null,
  multiplier: number
): ScoreBreakdown {
  const leftovers = hand.filter((_, index) => !(usedMask & (1 << index)));
  const rawScore = leftovers.reduce((total, card) => total + scoreCard(card, wildRank), 0);

  return {
    playerId,
    score: rawScore * multiplier,
    rawScore,
    multiplier,
    groups,
    leftovers,
    confirmed: false
  };
}

function betterScore(current: ScoreBreakdown, candidate: ScoreBreakdown): ScoreBreakdown {
  if (candidate.score !== current.score) {
    return candidate.score < current.score ? candidate : current;
  }

  const currentGrouped = current.groups.reduce((total, group) => total + group.cards.length, 0);
  const candidateGrouped = candidate.groups.reduce((total, group) => total + group.cards.length, 0);
  return candidateGrouped > currentGrouped ? candidate : current;
}

export function suggestBestScore(
  playerId: string,
  hand: Card[],
  wildRank: Rank | null,
  multiplier: number
): ScoreBreakdown {
  const candidates = generateCandidates(hand, wildRank);
  const naturals = candidates.filter((candidate) => candidate.kind === "natural");
  const sequences = candidates.filter((candidate) => candidate.kind === "sequence");
  const finals = candidates.filter((candidate) => candidate.kind === "final");

  let best = scoreForMask(playerId, hand, 0, [], wildRank, multiplier);

  for (const natural of naturals) {
    best = betterScore(
      best,
      scoreForMask(
        playerId,
        hand,
        natural.mask,
        [{ label: natural.label, kind: "natural", cards: natural.cards, valid: true }],
        wildRank,
        multiplier
      )
    );

    for (const sequence of sequences) {
      if (natural.mask & sequence.mask) {
        continue;
      }

      const sequenceMask = natural.mask | sequence.mask;
      best = betterScore(
        best,
        scoreForMask(
          playerId,
          hand,
          sequenceMask,
          [
            { label: natural.label, kind: "natural", cards: natural.cards, valid: true },
            { label: sequence.label, kind: "sequence", cards: sequence.cards, valid: true }
          ],
          wildRank,
          multiplier
        )
      );

      for (const final of finals) {
        if (sequenceMask & final.mask) {
          continue;
        }

        best = betterScore(
          best,
          scoreForMask(
            playerId,
            hand,
            sequenceMask | final.mask,
            [
              { label: natural.label, kind: "natural", cards: natural.cards, valid: true },
              { label: sequence.label, kind: "sequence", cards: sequence.cards, valid: true },
              { label: final.label, kind: "final", cards: final.cards, valid: true }
            ],
            wildRank,
            multiplier
          )
        );
      }
    }
  }

  return best;
}

export function scoreFromHudGroups(
  playerId: string,
  hand: Card[],
  groups: HudGroups,
  wildRank: Rank | null,
  multiplier: number
): ScoreBreakdown {
  const grouped = groupCards(hand, groups);
  const scoreGroups: ScoreGroup[] = [];
  const used = new Set<string>();

  if (validateNaturalSequence(grouped.natural)) {
    scoreGroups.push({
      label: "Natural sequence",
      kind: "natural",
      cards: grouped.natural,
      valid: true
    });
    grouped.natural.forEach((card) => used.add(card.uid));

    if (validateWildSequence(grouped.sequence, wildRank)) {
      scoreGroups.push({
        label: "Sequence",
        kind: "sequence",
        cards: grouped.sequence,
        valid: true
      });
      grouped.sequence.forEach((card) => used.add(card.uid));

      if (validateWildSequence(grouped.final, wildRank) || validateSet(grouped.final, wildRank)) {
        scoreGroups.push({
          label: "Sequence or set",
          kind: "final",
          cards: grouped.final,
          valid: true
        });
        grouped.final.forEach((card) => used.add(card.uid));
      }
    }
  }

  const leftovers = hand.filter((card) => !used.has(card.uid));
  const rawScore = leftovers.reduce((total, card) => total + scoreCard(card, wildRank), 0);

  return {
    playerId,
    score: rawScore * multiplier,
    rawScore,
    multiplier,
    groups: scoreGroups,
    leftovers,
    confirmed: false
  };
}

export function protectedNaturalIds(hand: Card[]): Set<string> {
  const candidates = generateCandidates(hand, null).filter((candidate) => candidate.kind === "natural");
  if (candidates.length === 0) {
    return new Set();
  }

  const best = candidates.reduce((winner, candidate) => {
    if (candidate.cards.length !== winner.cards.length) {
      return candidate.cards.length > winner.cards.length ? candidate : winner;
    }

    const winnerValue = winner.cards.reduce((total, card) => total + scoreCard(card, null), 0);
    const candidateValue = candidate.cards.reduce((total, card) => total + scoreCard(card, null), 0);
    return candidateValue > winnerValue ? candidate : winner;
  });

  return new Set(best.cards.map((card) => card.uid));
}

export function chooseTimeoutDiscard(hand: Card[], random = Math.random): Card | null {
  if (hand.length === 0) {
    return null;
  }

  const protectedIds = protectedNaturalIds(hand);
  const choices = hand.filter((card) => !protectedIds.has(card.uid));
  const pool = choices.length > 0 ? choices : hand;

  return pool[Math.floor(random() * pool.length)];
}

export function maskFromCards(hand: Card[], cards: Card[]): number {
  const uidToIndex = new Map(hand.map((card, index) => [card.uid, index]));
  const indexes = cards
    .map((card) => uidToIndex.get(card.uid))
    .filter((index): index is number => index !== undefined);
  return cardMask(indexes);
}
