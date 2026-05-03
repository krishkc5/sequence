import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  Unsubscribe
} from "firebase/firestore";
import { DrawSource, GameRoom, HudGroups, Rank, TimerSettings } from "../types";
import { roomCode } from "../game/cards";
import {
  addPlayer,
  confirmScore,
  createPlayer,
  createRoom,
  discardCard,
  drawCard,
  markSecretSeen,
  setChosenJoker,
  startGame,
  timeoutAutoPlay
} from "../game/engine";
import { db, ensureAnonymousAuth } from "./firebase";

function requireDb() {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  return db;
}

function roomRef(code: string) {
  return doc(requireDb(), "rooms", code.toUpperCase());
}

function seatStorageKey(code: string): string {
  return `sequence-seat-${code.toUpperCase()}`;
}

function readSeat(code: string): { playerId: string; token: string } | null {
  const raw = localStorage.getItem(seatStorageKey(code));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as { playerId: string; token: string };
  } catch {
    return null;
  }
}

function writeSeat(code: string, playerId: string, token: string): void {
  localStorage.setItem(seatStorageKey(code), JSON.stringify({ playerId, token }));
}

async function mutateRoom(code: string, mutate: (room: GameRoom) => GameRoom): Promise<GameRoom> {
  const ref = roomRef(code);

  return runTransaction(requireDb(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Room not found.");
    }

    const room = snapshot.data() as GameRoom;
    const nextRoom = mutate(room);
    transaction.set(ref, nextRoom);
    return nextRoom;
  });
}

export async function createOnlineRoom(
  name: string,
  timer: TimerSettings
): Promise<{ room: GameRoom; playerId: string }> {
  await ensureAnonymousAuth();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = roomCode();
    const ref = roomRef(code);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      continue;
    }

    const token = crypto.randomUUID();
    const player = createPlayer(name, token);
    const room = createRoom(code, player, timer);
    await setDoc(ref, room);
    writeSeat(code, player.id, token);
    return { room, playerId: player.id };
  }

  throw new Error("Could not create a unique room code. Try again.");
}

export async function joinOnlineRoom(
  code: string,
  name: string
): Promise<{ room: GameRoom; playerId: string }> {
  await ensureAnonymousAuth();

  const normalizedCode = code.trim().toUpperCase();
  const existingSeat = readSeat(normalizedCode);
  const ref = roomRef(normalizedCode);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("Room not found.");
  }

  const room = snapshot.data() as GameRoom;
  const restoredPlayer = existingSeat
    ? room.players.find(
        (player) => player.id === existingSeat.playerId && player.token === existingSeat.token
      )
    : null;

  if (restoredPlayer) {
    return { room, playerId: restoredPlayer.id };
  }

  const token = crypto.randomUUID();
  const player = createPlayer(name, token);
  const nextRoom = await mutateRoom(normalizedCode, (currentRoom) => addPlayer(currentRoom, player));
  writeSeat(normalizedCode, player.id, token);
  return { room: nextRoom, playerId: player.id };
}

export function subscribeRoom(code: string, onRoom: (room: GameRoom | null) => void): Unsubscribe {
  return onSnapshot(roomRef(code), (snapshot) => {
    onRoom(snapshot.exists() ? (snapshot.data() as GameRoom) : null);
  });
}

export async function startOnlineGame(code: string): Promise<void> {
  await mutateRoom(code, (room) => startGame(room));
}

export async function drawOnlineCard(code: string, playerId: string, source: DrawSource): Promise<void> {
  await mutateRoom(code, (room) => drawCard(room, playerId, source));
}

export async function discardOnlineCard(
  code: string,
  playerId: string,
  cardUid: string,
  declare: boolean,
  groups: HudGroups
): Promise<void> {
  await mutateRoom(code, (room) => discardCard(room, playerId, cardUid, declare, groups));
}

export async function confirmOnlineScore(
  code: string,
  playerId: string,
  groups: HudGroups | null
): Promise<void> {
  await mutateRoom(code, (room) => confirmScore(room, playerId, groups));
}

export async function chooseOnlineJoker(code: string, playerId: string, rank: Rank): Promise<void> {
  await mutateRoom(code, (room) => setChosenJoker(room, playerId, rank));
}

export async function seeOnlineSecret(code: string, playerId: string): Promise<void> {
  await mutateRoom(code, (room) => markSecretSeen(room, playerId));
}

export async function applyOnlineTimeout(code: string): Promise<void> {
  await mutateRoom(code, (room) => timeoutAutoPlay(room));
}
