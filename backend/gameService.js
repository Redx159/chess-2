import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { deserializeState, serializeState } from "../frontend/gameLogic/engine";

const COLLECTION = "arcaneChessRooms";
const HISTORY_COLLECTION = "arcaneChessHistory";
const FIRESTORE_TIMEOUT_MS = 12000;

function roomRef(code) {
  return doc(db, COLLECTION, code);
}

function historyCollectionRef() {
  return collection(db, HISTORY_COLLECTION);
}

function withTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), FIRESTORE_TIMEOUT_MS);
    }),
  ]);
}

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomSeat() {
  return Math.random() < 0.5 ? "white" : "black";
}

function resolvePlayerName(user, preferredName) {
  const candidate = preferredName?.trim();
  if (candidate) {
    return candidate.slice(0, 24);
  }
  return user.displayName || "Guest";
}

export async function createRoom(initialState, user, preferredName) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  const code = generateRoomCode();
  const hostSeat = randomSeat();
  const guestSeat = hostSeat === "white" ? "black" : "white";
  const playerName = resolvePlayerName(user, preferredName);

  await withTimeout(
    setDoc(roomRef(code), {
      code,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      players: {
        [hostSeat]: {
          uid: user.uid,
          name: playerName,
        },
        [guestSeat]: null,
      },
      historySaved: false,
      postGameExitBy: null,
      status: "waiting",
      state: serializeState(initialState),
    }),
    "Firestore timed out while creating the room. Check your network, firewall, antivirus, or Firebase project setup.",
  );
  return {
    code,
    assignedSeat: hostSeat,
    players: {
      [hostSeat]: {
        uid: user.uid,
        name: playerName,
      },
      [guestSeat]: null,
    },
    postGameExitBy: null,
    status: "waiting",
    state: initialState,
  };
}

export async function joinRoom(code, user, preferredName) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  const ref = roomRef(code.toUpperCase());
  let assignedSeat = null;
  const playerName = resolvePlayerName(user, preferredName);
  await withTimeout(
    runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        throw new Error("Room not found.");
      }
      const data = snapshot.data();
      const openSeat = Object.entries(data.players).find(([, player]) => !player)?.[0];
      if (openSeat) {
        assignedSeat = openSeat;
        transaction.update(ref, {
          players: {
            ...data.players,
            [openSeat]: {
              uid: user.uid,
              name: playerName,
            },
          },
          postGameExitBy: null,
          status: "active",
          updatedAt: serverTimestamp(),
        });
      }
    }),
    "Firestore timed out while joining the room. Check your network, firewall, antivirus, or Firebase project setup.",
  );

  const snapshot = await withTimeout(
    getDoc(ref),
    "Firestore timed out while loading the room after join.",
  );
  const data = snapshot.data();
  return {
    ...data,
    assignedSeat:
      assignedSeat ||
      Object.entries(data.players).find(([, player]) => player?.uid === user.uid)?.[0] ||
      null,
    postGameExitBy: data.postGameExitBy || null,
    state: deserializeState(data.state),
  };
}

export async function updateRoomState(code, nextState) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  const ref = roomRef(code.toUpperCase());
  const serializedState = serializeState(nextState);
  await withTimeout(
    runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        throw new Error("Room not found.");
      }

      const room = snapshot.data();
      const status = nextState.winner ? "finished" : "active";
      const payload = {
        state: serializedState,
        status,
        updatedAt: serverTimestamp(),
        historySaved: false,
        postGameExitBy: null,
      };

      if (nextState.winner && !room.historySaved) {
        const historyDoc = doc(historyCollectionRef());
        transaction.update(ref, {
          ...payload,
          historySaved: true,
        });
        transaction.set(historyDoc, {
          roomCode: code.toUpperCase(),
          players: room.players,
          participants: Object.values(room.players)
            .filter(Boolean)
            .map((player) => player.uid),
          winner: nextState.winner,
          endReason: nextState.endReason || "capture",
          turnCount: nextState.turnCount,
          finishedAt: serverTimestamp(),
        });
        return;
      }

      transaction.update(ref, payload);
    }),
    "Firestore timed out while syncing the match state.",
  );
}

export async function leaveFinishedRoom(code, uid) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  const ref = roomRef(code.toUpperCase());
  await withTimeout(
    updateDoc(ref, {
      postGameExitBy: uid,
      updatedAt: serverTimestamp(),
    }),
    "Firestore timed out while leaving the finished room.",
  );
}

export function subscribeToRoom(code, callback, onError) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  return onSnapshot(
    roomRef(code.toUpperCase()),
    (snapshot) => {
      if (!snapshot.exists()) {
        onError?.(new Error("Room not found."));
        return;
      }
      const data = snapshot.data();
      callback({
        ...data,
        state: deserializeState(data.state),
      });
    },
    onError,
  );
}

export function subscribeToMatchHistory(uid, callback, onError) {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  const historyQuery = query(historyCollectionRef(), where("participants", "array-contains", uid));
  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const entries = snapshot.docs
        .map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
        .sort((first, second) => {
          const firstTime = first.finishedAt?.seconds || 0;
          const secondTime = second.finishedAt?.seconds || 0;
          return secondTime - firstTime;
        });
      callback(entries);
    },
    onError,
  );
}
