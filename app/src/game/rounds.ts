import { RoundConfig } from "../types";

export const roundConfigs: RoundConfig[] = [
  {
    index: 0,
    label: "Round 1 · Normal · Double",
    kind: "normal",
    doubleLoserScore: true
  },
  {
    index: 1,
    label: "Round 2 · Secret Joker",
    kind: "secret",
    doubleLoserScore: false
  },
  {
    index: 2,
    label: "Round 3 · Choose Joker",
    kind: "chosen",
    doubleLoserScore: false
  },
  {
    index: 3,
    label: "Round 4 · Secret Joker",
    kind: "secret",
    doubleLoserScore: false
  },
  {
    index: 4,
    label: "Round 5 · Choose Joker",
    kind: "chosen",
    doubleLoserScore: false
  },
  {
    index: 5,
    label: "Round 6 · Secret Joker",
    kind: "secret",
    doubleLoserScore: false
  },
  {
    index: 6,
    label: "Round 7 · Normal · Double",
    kind: "normal",
    doubleLoserScore: true
  }
];

export function getRoundConfig(index: number): RoundConfig {
  return roundConfigs[index] ?? roundConfigs[roundConfigs.length - 1];
}
