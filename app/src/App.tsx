import {
  Check,
  Copy,
  Crown,
  Eye,
  EyeOff,
  LogIn,
  Play,
  ScrollText,
  Shuffle,
  Timer,
  Trophy,
  Users,
  WifiOff
} from "lucide-react";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "./components/CardView";
import { cardLabel, cardLongLabel, sortCards } from "./game/cards";
import { emptyGroups } from "./game/engine";
import { resolvePlayerWildRank, resolveScoringWildRank, validateDeclaredHand, validateNaturalSequence } from "./game/rules";
import { groupCards } from "./game/rules";
import { scoreFromHudGroups } from "./game/score";
import { hasFirebaseConfig } from "./services/firebase";
import {
  applyOnlineTimeout,
  chooseOnlineJoker,
  confirmOnlineScore,
  createOnlineRoom,
  discardOnlineCard,
  drawOnlineCard,
  joinOnlineRoom,
  seeOnlineSecret,
  startOnlineGame,
  subscribeRoom
} from "./services/roomStore";
import { Card, GameRoom, HudGroups, Rank, RANKS, ScoreBreakdown } from "./types";

const activeRoomKey = "sequence-active-room";
const activePlayerKey = "sequence-active-player";

type DragPayload =
  | { type: "hand"; cardUid: string }
  | { type: "draw"; source: "deck" | "discard" };

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clampTimer(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 60;
  }

  return Math.max(15, Math.min(300, Math.round(seconds)));
}

function laneTitle(kind: keyof HudGroups): string {
  switch (kind) {
    case "natural":
      return "Natural sequence";
    case "sequence":
      return "Sequence";
    case "final":
      return "Sequence / set";
    default:
      return "Hand";
  }
}

function reconcileGroups(groups: HudGroups, hand: Card[]): HudGroups {
  const handIds = new Set(hand.map((card) => card.uid));
  const seen = new Set<string>();

  const take = (ids: string[]) =>
    ids.filter((id) => {
      if (!handIds.has(id) || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

  const natural = take(groups.natural);
  const sequence = take(groups.sequence);
  const final = take(groups.final);
  const ungrouped = take(groups.ungrouped);

  for (const card of hand) {
    if (!seen.has(card.uid)) {
      ungrouped.push(card.uid);
      seen.add(card.uid);
    }
  }

  const handLookup = new Map(hand.map((card) => [card.uid, card]));
  const sortedUngrouped = sortCards(
    ungrouped.map((id) => handLookup.get(id)).filter((card): card is Card => !!card)
  ).map((card) => card.uid);

  return { ungrouped: sortedUngrouped, natural, sequence, final };
}

function moveCard(
  groups: HudGroups,
  cardUid: string,
  target: keyof HudGroups,
  beforeUid: string | null = null
): HudGroups {
  const next: HudGroups = {
    ungrouped: groups.ungrouped.filter((id) => id !== cardUid),
    natural: groups.natural.filter((id) => id !== cardUid),
    sequence: groups.sequence.filter((id) => id !== cardUid),
    final: groups.final.filter((id) => id !== cardUid)
  };

  const targetCards = [...next[target]];
  const insertIndex = beforeUid ? targetCards.indexOf(beforeUid) : -1;

  if (insertIndex >= 0) {
    targetCards.splice(insertIndex, 0, cardUid);
  } else {
    targetCards.push(cardUid);
  }

  next[target] = targetCards;
  return next;
}

function runWithMotion(update: () => void) {
  const motionDocument = document as Document & {
    startViewTransition?: (updateCallback: () => void) => void;
  };

  if (motionDocument.startViewTransition) {
    motionDocument.startViewTransition(update);
    return;
  }

  update();
}

function persistActiveSeat(code: string, playerId: string) {
  localStorage.setItem(activeRoomKey, code);
  localStorage.setItem(activePlayerKey, playerId);
}

function clearActiveSeat() {
  localStorage.removeItem(activeRoomKey);
  localStorage.removeItem(activePlayerKey);
}

function scoreLabel(score?: ScoreBreakdown): string {
  if (!score) {
    return "Pending";
  }

  return score.multiplier > 1 ? `${score.rawScore} × ${score.multiplier} = ${score.score}` : String(score.score);
}

export default function App() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(activeRoomKey) ?? "");
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(activePlayerKey) ?? "");
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [groups, setGroups] = useState<HudGroups>(() => emptyGroups());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"rules" | "leaderboard" | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastTimeoutRef = useRef<string>("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomCode || !hasFirebaseConfig) {
      return;
    }

    return subscribeRoom(roomCode, (nextRoom) => {
      setRoom(nextRoom);
      if (!nextRoom) {
        clearActiveSeat();
      }
    });
  }, [roomCode]);

  const round = room?.round ?? null;
  const me = room?.players.find((player) => player.id === playerId) ?? null;
  const hand = round?.hands[playerId] ?? [];

  useEffect(() => {
    setGroups((currentGroups) => {
      const nextGroups = reconcileGroups(currentGroups, hand);
      return JSON.stringify(nextGroups) === JSON.stringify(currentGroups) ? currentGroups : nextGroups;
    });
  }, [hand]);

  useEffect(() => {
    if (selectedCard && !hand.some((card) => card.uid === selectedCard)) {
      setSelectedCard(null);
    }
  }, [hand, selectedCard]);

  const isHost = !!room && room.hostId === playerId;
  const isMyTurn = room?.phase === "playing" && round?.currentPlayerId === playerId;
  const topDiscard = round?.discardPile[round.discardPile.length - 1] ?? null;
  const selected = hand.find((card) => card.uid === selectedCard) ?? null;
  const playerWildRank = round ? resolvePlayerWildRank(round, playerId) : null;
  const scoringWildRank = round ? resolveScoringWildRank(round) : null;
  const groupedCards = useMemo(() => groupCards(hand, groups), [hand, groups]);
  const naturalReady = validateNaturalSequence(groupedCards.natural);
  const declareValidation =
    round && selected
      ? validateDeclaredHand(hand, selected.uid, groups, playerWildRank)
      : { valid: false, message: "Select a discard.", groups: [] };

  const remainingMs =
    room?.phase === "playing" && round && room.settings.timer.enabled
      ? Math.max(0, room.settings.timer.seconds * 1000 - (now - round.turn.startedAt))
      : null;
  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!room || room.phase !== "playing" || !round || !room.settings.timer.enabled || remainingMs === null) {
      return;
    }

    if (remainingMs > 0) {
      return;
    }

    const timeoutKey = `${room.code}-${round.index}-${round.currentPlayerId}-${round.turn.startedAt}`;
    if (lastTimeoutRef.current === timeoutKey) {
      return;
    }

    lastTimeoutRef.current = timeoutKey;
    applyOnlineTimeout(room.code).catch(() => {
      lastTimeoutRef.current = "";
    });
  }, [remainingMs, room, round]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    await runAction(async () => {
      const { room: createdRoom, playerId: createdPlayerId } = await createOnlineRoom(name, {
        enabled: timerEnabled,
        seconds: clampTimer(timerSeconds)
      });
      setRoom(createdRoom);
      setRoomCode(createdRoom.code);
      setPlayerId(createdPlayerId);
      persistActiveSeat(createdRoom.code, createdPlayerId);
    });
  }

  async function joinRoom() {
    await runAction(async () => {
      const { room: joinedRoom, playerId: joinedPlayerId } = await joinOnlineRoom(joinCode, name);
      setRoom(joinedRoom);
      setRoomCode(joinedRoom.code);
      setPlayerId(joinedPlayerId);
      persistActiveSeat(joinedRoom.code, joinedPlayerId);
    });
  }

  function moveSelectedCard(target: keyof HudGroups, beforeUid: string | null = null) {
    const cardUid = dragPayload?.type === "hand" ? dragPayload.cardUid : selectedCard;
    if (!cardUid) {
      return;
    }

    runWithMotion(() => {
      setGroups((currentGroups) => moveCard(currentGroups, cardUid, target, beforeUid));
      setSelectedCard(cardUid);
    });
  }

  function handleLaneDrop(target: keyof HudGroups, beforeUid: string | null = null) {
    if (!room) {
      return;
    }

    if (dragPayload?.type === "draw" && canDraw) {
      runAction(() => drawOnlineCard(room.code, playerId, dragPayload.source));
      setDragPayload(null);
      return;
    }

    moveSelectedCard(target, beforeUid);
    setDragPayload(null);
  }

  function handleDiscardDrop(faceDown: boolean) {
    const cardUid = dragPayload?.type === "hand" ? dragPayload.cardUid : selectedCard;
    if (!room || !round || !cardUid || !canDropHandCard) {
      setDragPayload(null);
      return;
    }

    if (faceDown) {
      const validation = validateDeclaredHand(hand, cardUid, groups, playerWildRank);
      if (!validation.valid) {
        setError(validation.message);
        setDragPayload(null);
        return;
      }
    }

    runAction(async () => {
      await discardOnlineCard(room.code, playerId, cardUid, faceDown, groups);
      setSelectedCard(null);
    });
    setDragPayload(null);
  }

  function preventDropDefault(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  function renderCards(cards: Card[], kind: keyof HudGroups, overlapped = false, compact = false) {
    return cards.map((card) => (
      <CardView
        key={card.uid}
        card={card}
        compact={compact}
        overlapped={overlapped}
        draggable
        selected={selectedCard === card.uid}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedCard(card.uid);
        }}
        onDragStart={() => {
          setSelectedCard(card.uid);
          setDragPayload({ type: "hand", cardUid: card.uid });
        }}
        onDragEnd={() => setDragPayload(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.stopPropagation();
          handleLaneDrop(kind, card.uid);
        }}
      />
    ));
  }

  function renderLane(kind: keyof HudGroups) {
    const isHand = kind === "ungrouped";
    const cards = isHand ? sortCards(groupedCards[kind]) : groupedCards[kind];

    return (
      <section
        className={classNames("lane", kind !== "ungrouped" && "made-lane", isHand && "hand-lane")}
        onClick={() => selectedCard && moveSelectedCard(kind)}
        onDragOver={preventDropDefault}
        onDrop={() => handleLaneDrop(kind)}
      >
        <div className="lane-head">
          <span>{laneTitle(kind)}</span>
          <small>{cards.length}</small>
        </div>
        <div className="card-row overlap-row">
          {renderCards(cards, kind, true)}
        </div>
      </section>
    );
  }

  if (!hasFirebaseConfig) {
    return (
      <main className="app-shell centered">
        <section className="setup-panel">
          <WifiOff size={32} />
          <h1>Sequence</h1>
          <p>Firebase environment variables are needed before online rooms can start.</p>
          <code>.env.example</code>
        </section>
      </main>
    );
  }

  if (!room || !me) {
    return (
      <main className="app-shell auth-layout">
        <section className="brand-panel">
          <div className="mini-table">
            <CardView card={null} hidden />
            <CardView card={{ uid: "demo", deck: 1, suit: "hearts", rank: "Q" }} />
            <CardView card={{ uid: "demo2", deck: 1, suit: "spades", rank: "K" }} />
          </div>
          <h1>Sequence</h1>
          <p>Room-code card nights with private hands, joker rounds, and automatic scoring.</p>
        </section>

        <section className="auth-panel">
          <label>
            Display name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} />
          </label>

          <div className="timer-box">
            <label className="check-row">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(event) => setTimerEnabled(event.target.checked)}
              />
              <span>Turn timer</span>
            </label>
            <label>
              Seconds
              <input
                type="number"
                min={15}
                max={300}
                value={timerSeconds}
                disabled={!timerEnabled}
                onChange={(event) => setTimerSeconds(Number(event.target.value))}
              />
            </label>
          </div>

          <button className="primary-action" type="button" disabled={busy} onClick={createRoom}>
            <Play size={18} />
            Create room
          </button>

          <div className="join-row">
            <input
              placeholder="Room code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              maxLength={5}
            />
            <button type="button" disabled={busy || !joinCode.trim()} onClick={joinRoom}>
              <LogIn size={18} />
              Join
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
        </section>
      </main>
    );
  }

  const currentPlayer = room.players.find((player) => player.id === round?.currentPlayerId);
  const winner = round?.declared
    ? room.players.find((player) => player.id === round.declared?.playerId)
    : null;
  const myScore = round?.scoring[playerId];
  const canDraw = isMyTurn && !!round && !round.turn.drawn && !busy;
  const canDrawDiscard = canDraw && !!topDiscard;
  const canDropHandCard = isMyTurn && !!round?.turn.drawn && !busy;
  const canDiscard = canDropHandCard && !!selected;
  const canDeclare = canDiscard && declareValidation.valid;
  const ownChosenRank = round?.selectedJokers[playerId] ?? "A";
  const secretTurnLocked = room.phase === "playing" && isMyTurn && !!round?.turn.drawn;
  const canPeekSecret =
    room.phase === "playing" && round?.config.kind === "secret" && naturalReady && !secretTurnLocked;
  const canShowSecret =
    round?.config.kind === "secret" &&
    round.secretCard &&
    (round.secretRevealed ||
      room.phase === "scoring" ||
      (round.secretSeen[playerId] && !secretTurnLocked));
  const secretStatus = secretTurnLocked
    ? "Finish turn"
    : canShowSecret
      ? "Secret"
      : round?.secretSeen[playerId]
        ? "Seen"
        : "Hidden";

  return (
    <main className="app-shell game-layout">
      <div className="landscape-prompt" role="status">
        <strong>Rotate your phone</strong>
        <span>Use landscape orientation for the card table.</span>
      </div>

      <header className="top-bar">
        <div>
          <p className="eyebrow">Room {room.code}</p>
          <h1>{round?.config.label ?? "Lobby"}</h1>
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            type="button"
            title="Copy room code"
            onClick={() => navigator.clipboard.writeText(room.code)}
          >
            <Copy size={18} />
          </button>
          <button
            className={classNames("panel-toggle", panel === "leaderboard" && "active")}
            type="button"
            onClick={() => setPanel(panel === "leaderboard" ? null : "leaderboard")}
          >
            <Trophy size={18} />
            Scores
          </button>
          <button
            className={classNames("panel-toggle", panel === "rules" && "active")}
            type="button"
            onClick={() => setPanel(panel === "rules" ? null : "rules")}
          >
            <ScrollText size={18} />
            Rules
          </button>
          <button
            className="panel-toggle quiet"
            type="button"
            onClick={() => {
              clearActiveSeat();
              setRoom(null);
              setRoomCode("");
              setPlayerId("");
            }}
          >
            Leave
          </button>
        </div>
      </header>

      {panel && (
        <aside className="side-panel">
          {panel === "leaderboard" ? (
            <>
              <h2>Leaderboard</h2>
              <div className="score-list">
                {[...room.players]
                  .sort((a, b) => a.totalScore - b.totalScore)
                  .map((player, index) => (
                    <div className="score-line" key={player.id}>
                      <span>
                        {index === 0 && <Crown size={15} />}
                        {player.name}
                      </span>
                      <strong>{player.totalScore}</strong>
                    </div>
                  ))}
              </div>
              {room.history.length > 0 && (
                <div className="history-list">
                  {room.history.map((record) => (
                    <div key={record.roundIndex}>
                      <strong>{record.label}</strong>
                      <span>
                        Winner: {room.players.find((player) => player.id === record.winnerId)?.name ?? "Player"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2>Rules</h2>
              <p>Draw one card, then discard one card. A declare discard goes face down.</p>
              <p>
                Win with a natural sequence, then a joker sequence, then a sequence or set. Groups must be built in
                that order.
              </p>
              <p>
                Printed jokers are always wild. Secret and chosen joker rounds reveal their table joker for scoring.
              </p>
              <p>Lowest total score after seven rounds wins. Rounds 1 and 7 double loser scores.</p>
            </>
          )}
        </aside>
      )}

      {room.phase === "lobby" && (
        <section className="lobby">
          <div className="lobby-head">
            <Users size={22} />
            <h2>Players</h2>
          </div>
          <div className="seat-grid">
            {room.players.map((player) => (
              <div className="seat-card" key={player.id}>
                <span>{player.name}</span>
                {player.id === room.hostId && <small>Host</small>}
              </div>
            ))}
          </div>
          <div className="lobby-actions">
            <span>
              {room.settings.timer.enabled ? `${room.settings.timer.seconds}s timer` : "No timer"}
            </span>
            {isHost && (
              <button
                className="primary-action"
                type="button"
                disabled={busy || room.players.length < 2}
                onClick={() => runAction(() => startOnlineGame(room.code))}
              >
                <Shuffle size={18} />
                Start
              </button>
            )}
          </div>
        </section>
      )}

      {round && room.phase !== "lobby" && (
        <>
          <section className="table">
            <div className="center-piles">
              <div
                className={classNames("pile-button", "draw-pile", canDraw && "interactive-pile")}
                role="button"
                tabIndex={canDraw ? 0 : -1}
                aria-disabled={!canDraw}
                onClick={() => canDraw && runAction(() => drawOnlineCard(room.code, playerId, "deck"))}
              >
                <CardView
                  card={null}
                  hidden
                  draggable={canDraw}
                  onDragStart={() => setDragPayload({ type: "draw", source: "deck" })}
                  onDragEnd={() => setDragPayload(null)}
                />
                <span>{round.deck.length}</span>
              </div>

              <div
                className={classNames(
                  "pile-button",
                  "discard-pile",
                  (canDrawDiscard || canDropHandCard) && "interactive-pile",
                  canDropHandCard && "drop-pile"
                )}
                role="button"
                tabIndex={canDrawDiscard || canDropHandCard ? 0 : -1}
                aria-disabled={!canDrawDiscard && !canDropHandCard}
                onClick={() => {
                  if (canDrawDiscard) {
                    runAction(() => drawOnlineCard(room.code, playerId, "discard"));
                    return;
                  }

                  if (canDropHandCard) {
                    handleDiscardDrop(false);
                  }
                }}
                onDragOver={canDropHandCard ? preventDropDefault : undefined}
                onDrop={() => handleDiscardDrop(false)}
              >
                <CardView
                  card={topDiscard}
                  draggable={canDrawDiscard}
                  onDragStart={() => setDragPayload({ type: "draw", source: "discard" })}
                  onDragEnd={() => setDragPayload(null)}
                />
                <span>{canDiscard ? "Drop up" : "Discard"}</span>
              </div>

              {round.config.kind === "secret" && (
                <button
                  className={classNames("pile-button", "secret-pile", (canPeekSecret || canShowSecret) && "interactive-pile")}
                  type="button"
                  disabled={!canPeekSecret && !canShowSecret}
                  onClick={() => canPeekSecret && runAction(() => seeOnlineSecret(room.code, playerId))}
                >
                  <CardView card={canShowSecret ? round.secretCard : null} hidden={!canShowSecret} />
                  <span>{secretStatus}</span>
                </button>
              )}
            </div>

            <div className="turn-strip">
              <span>
                {room.phase === "complete"
                  ? "Game complete"
                  : room.phase === "scoring"
                    ? `${winner?.name ?? "Winner"} declared`
                    : isMyTurn
                      ? round.turn.drawn
                        ? "Discard or declare"
                        : "Draw"
                      : `${currentPlayer?.name ?? "Player"}'s turn`}
              </span>
              {remainingSeconds !== null && (
                <strong className={remainingSeconds <= 10 ? "timer-warn" : ""}>
                  <Timer size={16} />
                  {remainingSeconds}s
                </strong>
              )}
            </div>
          </section>

          <section className="player-console">
            <div className="status-grid">
              <div>
                <span className="eyebrow">You</span>
                <strong>{me.name}</strong>
              </div>
              <div>
                <span className="eyebrow">Active joker</span>
                <strong>{playerWildRank ?? "Printed only"}</strong>
              </div>
              {round.config.kind === "chosen" && room.phase === "playing" && (
                <label className="joker-select">
                  Chosen rank
                  <select
                    value={ownChosenRank}
                    onChange={(event) => runAction(() => chooseOnlineJoker(room.code, playerId, event.target.value as Rank))}
                  >
                    {RANKS.map((rank) => (
                      <option value={rank} key={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {round.config.kind === "secret" && (
                <div>
                  <span className="eyebrow">Secret</span>
                  <strong>
                    {canShowSecret && round.secretCard
                      ? cardLabel(round.secretCard)
                      : secretTurnLocked && naturalReady
                        ? "After discard"
                        : naturalReady
                          ? "Peek ready"
                          : "Locked"}
                  </strong>
                </div>
              )}
            </div>

            <div className="play-area">
              <div className="hud-grid">
                {renderLane("natural")}
                {renderLane("sequence")}
                {renderLane("final")}
                {renderLane("ungrouped")}
              </div>

              <aside className="action-rail">
                <div className="selected-card">
                  {selected ? (
                    <>
                      <CardView card={selected} compact />
                      <span>{cardLongLabel(selected)}</span>
                    </>
                  ) : (
                    <span>Select or drag a card</span>
                  )}
                </div>
                <div className="turn-actions">
                  <button
                    className="discard-action"
                    type="button"
                    disabled={!canDropHandCard}
                    onDragOver={canDropHandCard ? preventDropDefault : undefined}
                    onDrop={() => handleDiscardDrop(false)}
                    onClick={() => handleDiscardDrop(false)}
                  >
                    <Eye size={22} />
                    Discard up
                  </button>
                  <button
                    className="declare-action"
                    type="button"
                    disabled={!canDeclare}
                    title={declareValidation.message}
                    onDragOver={canDropHandCard ? preventDropDefault : undefined}
                    onDrop={() => handleDiscardDrop(true)}
                    onClick={() => handleDiscardDrop(true)}
                  >
                    <EyeOff size={22} />
                    Declare
                  </button>
                </div>
                <div className="move-buttons">
                  {(["natural", "sequence", "final", "ungrouped"] as const).map((target) => (
                    <button
                      type="button"
                      disabled={!selectedCard}
                      key={target}
                      onClick={() => moveSelectedCard(target)}
                      onDragOver={preventDropDefault}
                      onDrop={() => handleLaneDrop(target)}
                    >
                      {laneTitle(target)}
                    </button>
                  ))}
                </div>
              </aside>
            </div>

            {room.phase === "playing" && selected && !declareValidation.valid && (
              <p className="hint-text">{declareValidation.message}</p>
            )}
          </section>

          {room.phase === "scoring" && (
            <section className="scoring-panel">
              <div>
                <span className="eyebrow">Scoring joker</span>
                <h2>{scoringWildRank ?? "Printed jokers only"}</h2>
              </div>
              {round.declared?.playerId === playerId ? (
                <p>You declared this round. Your score is 0.</p>
              ) : (
                <div className="score-confirm">
                  <strong>{scoreLabel(myScore)}</strong>
                  {myScore?.confirmed ? (
                    <span className="confirmed">
                      <Check size={18} />
                      Confirmed
                    </span>
                  ) : (
                    <div className="turn-actions">
                      <button type="button" onClick={() => runAction(() => confirmOnlineScore(room.code, playerId, null))}>
                        <Check size={18} />
                        Suggested
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction(() => confirmOnlineScore(room.code, playerId, groups))}
                      >
                        Use HUD
                      </button>
                    </div>
                  )}
                  {myScore && <ScoreBreakdownView score={myScore} />}
                  {round && !myScore?.confirmed && (
                    <ScoreBreakdownView
                      score={scoreFromHudGroups(
                        playerId,
                        hand,
                        groups,
                        resolveScoringWildRank(round),
                        round.config.doubleLoserScore ? 2 : 1
                      )}
                      label="HUD score"
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {room.phase === "complete" && (
            <section className="complete-panel">
              <Trophy size={28} />
              <h2>{[...room.players].sort((a, b) => a.totalScore - b.totalScore)[0]?.name} wins</h2>
            </section>
          )}
        </>
      )}

      {error && <div className="toast">{error}</div>}
    </main>
  );
}

function ScoreBreakdownView({ score, label = "Suggested groups" }: { score: ScoreBreakdown; label?: string }) {
  return (
    <div className="breakdown">
      <span className="eyebrow">{label}</span>
      {score.groups.length > 0 ? (
        score.groups.map((group) => (
          <div className="breakdown-line" key={`${group.kind}-${group.cards.map((card) => card.uid).join("-")}`}>
            <span>{group.label}</span>
            <small>{group.cards.map(cardLabel).join(" ")}</small>
          </div>
        ))
      ) : (
        <div className="breakdown-line">
          <span>No made groups</span>
          <small>All cards count</small>
        </div>
      )}
      <div className="breakdown-line">
        <span>Left over</span>
        <small>{score.leftovers.length > 0 ? score.leftovers.map(cardLabel).join(" ") : "None"}</small>
      </div>
    </div>
  );
}
