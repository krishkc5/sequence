import {
  Card,
  DrawSource,
  GameRoom,
  HudGroups,
  Player,
  Rank,
  RoundState,
  ScoreBreakdown,
  TimerSettings
} from "../types";
import { buildDeck, shuffle } from "./cards";
import { getRoundConfig, roundConfigs } from "./rounds";
import { resolvePlayerWildRank, resolveScoringWildRank, validateDeclaredHand } from "./rules";
import { chooseTimeoutDiscard, scoreFromHudGroups, suggestBestScore } from "./score";

export function emptyGroups(cardIds: string[] = []): HudGroups {
  return {
    ungrouped: cardIds,
    natural: [],
    sequence: [],
    final: []
  };
}

export function createPlayer(name: string, token: string): Player {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Player",
    token,
    totalScore: 0,
    roundScores: [],
    joinedAt: Date.now()
  };
}

export function createRoom(code: string, host: Player, timer: TimerSettings): GameRoom {
  return {
    code,
    phase: "lobby",
    hostId: host.id,
    players: [host],
    settings: {
      timer
    },
    round: null,
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function addPlayer(room: GameRoom, player: Player): GameRoom {
  if (room.phase !== "lobby") {
    throw new Error("Seats are locked after the game starts.");
  }

  if (room.players.length >= 8) {
    throw new Error("This room already has 8 players.");
  }

  return {
    ...room,
    players: [...room.players, player],
    updatedAt: Date.now()
  };
}

function playerAfter(room: GameRoom, playerId: string): string {
  const index = room.players.findIndex((player) => player.id === playerId);
  return room.players[(index + 1) % room.players.length].id;
}

function selectedJokers(players: Player[]): Record<string, Rank> {
  return Object.fromEntries(players.map((player) => [player.id, "A" as Rank]));
}

function dealHands(players: Player[], deck: Card[]): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};

  for (const player of players) {
    hands[player.id] = deck.splice(0, 10);
  }

  return hands;
}

export function createRound(room: GameRoom, roundIndex: number, dealerId: string): RoundState {
  const config = getRoundConfig(roundIndex);
  const deck = shuffle(buildDeck(room.players.length));
  const hands = dealHands(room.players, deck);
  const secretCard = config.kind === "secret" ? deck.shift() ?? null : null;
  const firstDiscard = deck.shift();

  if (!firstDiscard) {
    throw new Error("The deck did not contain enough cards.");
  }

  return {
    index: roundIndex,
    config,
    dealerId,
    currentPlayerId: playerAfter(room, dealerId),
    deck,
    discardPile: [firstDiscard],
    hands,
    turn: {
      drawn: false,
      startedAt: Date.now(),
      drawnCardUid: null
    },
    secretCard,
    secretRevealed: false,
    secretSeen: Object.fromEntries(room.players.map((player) => [player.id, false])),
    selectedJokers: selectedJokers(room.players),
    declared: null,
    winnerJokerRank: null,
    scoring: {}
  };
}

export function startGame(room: GameRoom): GameRoom {
  if (room.players.length < 2) {
    throw new Error("At least 2 players are needed.");
  }

  const dealer = room.players[Math.floor(Math.random() * room.players.length)];

  return {
    ...room,
    phase: "playing",
    round: createRound(room, 0, dealer.id),
    history: [],
    players: room.players.map((player) => ({
      ...player,
      totalScore: 0,
      roundScores: []
    })),
    updatedAt: Date.now()
  };
}

function reshuffleIfNeeded(round: RoundState): RoundState {
  if (round.deck.length > 0 || round.discardPile.length <= 1) {
    return round;
  }

  const topDiscard = round.discardPile[round.discardPile.length - 1];
  const rest = round.discardPile.slice(0, -1);

  return {
    ...round,
    deck: shuffle(rest),
    discardPile: [topDiscard]
  };
}

export function drawCard(room: GameRoom, playerId: string, source: DrawSource): GameRoom {
  const round = room.round;
  if (!round || room.phase !== "playing") {
    throw new Error("The round is not active.");
  }

  if (round.currentPlayerId !== playerId) {
    throw new Error("It is not your turn.");
  }

  if (round.turn.drawn) {
    throw new Error("You already drew this turn.");
  }

  const nextRound = source === "deck" ? reshuffleIfNeeded(round) : round;
  const deck = [...nextRound.deck];
  const discardPile = [...nextRound.discardPile];
  const hands = { ...nextRound.hands, [playerId]: [...nextRound.hands[playerId]] };
  const drawnCard = source === "deck" ? deck.shift() : discardPile.pop();

  if (!drawnCard) {
    throw new Error("No card is available from that pile.");
  }

  hands[playerId].push(drawnCard);

  return {
    ...room,
    round: {
      ...nextRound,
      deck,
      discardPile,
      hands,
      turn: {
        drawn: true,
        startedAt: nextRound.turn.startedAt,
        drawnCardUid: drawnCard.uid
      }
    },
    updatedAt: Date.now()
  };
}

function nextTurn(room: GameRoom, round: RoundState): RoundState {
  return {
    ...round,
    currentPlayerId: playerAfter(room, round.currentPlayerId),
    turn: {
      drawn: false,
      startedAt: Date.now(),
      drawnCardUid: null
    }
  };
}

function buildScoring(room: GameRoom, round: RoundState, winnerId: string): Record<string, ScoreBreakdown> {
  const scoringWildRank = resolveScoringWildRank(round);
  const multiplier = round.config.doubleLoserScore ? 2 : 1;

  return Object.fromEntries(
    room.players.map((player) => {
      if (player.id === winnerId) {
        const winnerScore: ScoreBreakdown = {
          playerId: player.id,
          score: 0,
          rawScore: 0,
          multiplier: 1,
          groups: [],
          leftovers: [],
          confirmed: true
        };
        return [player.id, winnerScore];
      }

      return [
        player.id,
        suggestBestScore(player.id, round.hands[player.id] ?? [], scoringWildRank, multiplier)
      ];
    })
  );
}

export function discardCard(
  room: GameRoom,
  playerId: string,
  cardUid: string,
  declare: boolean,
  groups: HudGroups
): GameRoom {
  const round = room.round;
  if (!round || room.phase !== "playing") {
    throw new Error("The round is not active.");
  }

  if (round.currentPlayerId !== playerId) {
    throw new Error("It is not your turn.");
  }

  if (!round.turn.drawn) {
    throw new Error("Draw before discarding.");
  }

  const hand = round.hands[playerId] ?? [];
  const card = hand.find((candidate) => candidate.uid === cardUid);
  if (!card) {
    throw new Error("That card is not in your hand.");
  }

  if (declare) {
    const validation = validateDeclaredHand(
      hand,
      cardUid,
      groups,
      resolvePlayerWildRank(round, playerId)
    );

    if (!validation.valid) {
      throw new Error(validation.message);
    }
  }

  const hands = {
    ...round.hands,
    [playerId]: hand.filter((candidate) => candidate.uid !== cardUid)
  };

  if (declare) {
    const declaredRound: RoundState = {
      ...round,
      hands,
      declared: {
        playerId,
        discard: card,
        groups,
        declaredAt: Date.now()
      },
      winnerJokerRank: round.config.kind === "chosen" ? round.selectedJokers[playerId] : null,
      secretRevealed: round.config.kind === "secret",
      scoring: {}
    };

    const scoringRound = {
      ...declaredRound,
      scoring: buildScoring(room, declaredRound, playerId)
    };

    return {
      ...room,
      phase: "scoring",
      round: scoringRound,
      updatedAt: Date.now()
    };
  }

  return {
    ...room,
    round: nextTurn(room, {
      ...round,
      hands,
      discardPile: [...round.discardPile, card]
    }),
    updatedAt: Date.now()
  };
}

function nextDealer(room: GameRoom, currentDealerId: string): string {
  return playerAfter(room, currentDealerId);
}

function finalizeIfReady(room: GameRoom): GameRoom {
  const round = room.round;
  if (!round || room.phase !== "scoring" || !round.declared) {
    return room;
  }

  const allConfirmed = room.players.every((player) => round.scoring[player.id]?.confirmed);
  if (!allConfirmed) {
    return room;
  }

  const scores = Object.fromEntries(
    room.players.map((player) => [player.id, round.scoring[player.id]?.score ?? 0])
  );
  const players = room.players.map((player) => {
    const score = scores[player.id] ?? 0;
    return {
      ...player,
      totalScore: player.totalScore + score,
      roundScores: [...player.roundScores, score]
    };
  });
  const history = [
    ...room.history,
    {
      roundIndex: round.index,
      label: round.config.label,
      winnerId: round.declared.playerId,
      scores
    }
  ];

  if (round.index >= roundConfigs.length - 1) {
    return {
      ...room,
      phase: "complete",
      players,
      history,
      updatedAt: Date.now()
    };
  }

  const roomForNextRound = {
    ...room,
    players,
    history
  };
  const dealerId = nextDealer(roomForNextRound, round.dealerId);

  return {
    ...roomForNextRound,
    phase: "playing",
    round: createRound(roomForNextRound, round.index + 1, dealerId),
    updatedAt: Date.now()
  };
}

export function confirmScore(
  room: GameRoom,
  playerId: string,
  groups: HudGroups | null
): GameRoom {
  const round = room.round;
  if (!round || room.phase !== "scoring") {
    throw new Error("Scoring is not active.");
  }

  if (round.declared?.playerId === playerId) {
    return room;
  }

  const multiplier = round.config.doubleLoserScore ? 2 : 1;
  const scoringWildRank = resolveScoringWildRank(round);
  const score = groups
    ? scoreFromHudGroups(playerId, round.hands[playerId] ?? [], groups, scoringWildRank, multiplier)
    : round.scoring[playerId] ?? suggestBestScore(playerId, round.hands[playerId] ?? [], scoringWildRank, multiplier);

  const nextRoom = {
    ...room,
    round: {
      ...round,
      scoring: {
        ...round.scoring,
        [playerId]: {
          ...score,
          confirmed: true
        }
      }
    },
    updatedAt: Date.now()
  };

  return finalizeIfReady(nextRoom);
}

export function setChosenJoker(room: GameRoom, playerId: string, rank: Rank): GameRoom {
  const round = room.round;
  if (!round || round.config.kind !== "chosen" || room.phase !== "playing") {
    return room;
  }

  return {
    ...room,
    round: {
      ...round,
      selectedJokers: {
        ...round.selectedJokers,
        [playerId]: rank
      }
    },
    updatedAt: Date.now()
  };
}

export function markSecretSeen(room: GameRoom, playerId: string): GameRoom {
  const round = room.round;
  if (!round || round.config.kind !== "secret") {
    return room;
  }

  const secretSeen = {
    ...round.secretSeen,
    [playerId]: true
  };
  const secretRevealed = room.players.every((player) => secretSeen[player.id]);

  return {
    ...room,
    round: {
      ...round,
      secretSeen,
      secretRevealed
    },
    updatedAt: Date.now()
  };
}

export function timeoutAutoPlay(room: GameRoom): GameRoom {
  const round = room.round;
  if (!round || room.phase !== "playing" || !room.settings.timer.enabled) {
    return room;
  }

  const elapsed = Date.now() - round.turn.startedAt;
  if (elapsed < room.settings.timer.seconds * 1000) {
    return room;
  }

  let nextRoom = room;
  if (!round.turn.drawn) {
    nextRoom = drawCard(nextRoom, round.currentPlayerId, "deck");
  }

  const nextRound = nextRoom.round;
  if (!nextRound) {
    return nextRoom;
  }

  const hand = nextRound.hands[nextRound.currentPlayerId] ?? [];
  const discard = chooseTimeoutDiscard(hand);
  if (!discard) {
    return nextRoom;
  }

  return discardCard(nextRoom, nextRound.currentPlayerId, discard.uid, false, emptyGroups());
}
