import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Board from "../components/Board";
import ControlPanel from "../components/ControlPanel";
import OnlineLobby from "../components/OnlineLobby";
import PromotionModal from "../components/PromotionModal";
import { auth, hasFirebaseConfig, signInGoogle, signInGuest } from "../../backend/firebase";
import { createRoom, joinRoom, subscribeToRoom, updateRoomState } from "../../backend/gameService";
import {
  applyAbility,
  applyMove,
  canUseAbility,
  createInitialState,
  getAbilityTargets,
  getEventAnnouncement,
  getEventSummary,
  getLegalMoves,
  getPieceState,
  getVisibleSquares,
  resolvePromotion,
} from "../gameLogic/engine";

function detectPlayerColor(roomData, authUser) {
  if (!roomData || !authUser) {
    return null;
  }
  if (roomData.players?.white?.uid === authUser.uid) {
    return "white";
  }
  if (roomData.players?.black?.uid === authUser.uid) {
    return "black";
  }
  return null;
}

export default function GamePage() {
  const [mode, setMode] = useState("local");
  const [state, setState] = useState(createInitialState);
  const [localGameStarted, setLocalGameStarted] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [abilityMode, setAbilityMode] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [eventToast, setEventToast] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [playerSeat, setPlayerSeat] = useState(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const previousEventKeyRef = useRef(null);

  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    return onAuthStateChanged(auth, (user) => setAuthUser(user));
  }, []);

  useEffect(() => {
    if (!roomCode) {
      return undefined;
    }
    const unsubscribe = subscribeToRoom(
      roomCode,
      (data) => {
        setRoomData(data);
        setState(data.state);
      },
      (error) => setStatusMessage(error.message),
    );
    return unsubscribe;
  }, [roomCode]);

  useEffect(() => {
    if (state.pendingAbility?.type === "knight") {
      setSelectedPieceId(state.pendingAbility.pieceId);
      setAbilityMode(true);
      return;
    }
    if (!state.pendingPromotion) {
      setAbilityMode(false);
    }
  }, [state.pendingAbility, state.pendingPromotion]);

  useEffect(() => {
    const eventKey = state.activeEvent
      ? `${state.activeEvent.type}-${state.activeEvent.startedOnTurn ?? "manual"}`
      : null;
    if (eventKey && eventKey !== previousEventKeyRef.current) {
      setEventToast(getEventAnnouncement(state.activeEvent));
      const timeoutId = window.setTimeout(() => setEventToast(null), 3200);
      previousEventKeyRef.current = eventKey;
      return () => window.clearTimeout(timeoutId);
    }
    previousEventKeyRef.current = eventKey;
    return undefined;
  }, [state.activeEvent]);

  const playerColor = useMemo(
    () => playerSeat || detectPlayerColor(roomData, authUser),
    [playerSeat, roomData, authUser],
  );
  const perspective = mode === "online" ? playerColor || "white" : "white";
  const visibilityColor = mode === "online" ? playerColor || "white" : state.currentTurn;
  const visibleSquares = useMemo(
    () => getVisibleSquares(state, visibilityColor),
    [state, visibilityColor],
  );
  const selectedPiece = selectedPieceId ? getPieceState(state, selectedPieceId)?.piece : null;
  const moveTargets = selectedPieceId && !abilityMode ? getLegalMoves(state, selectedPieceId) : [];
  const abilityTargets = selectedPieceId && abilityMode ? getAbilityTargets(state, selectedPieceId) : [];
  const abilityReady = selectedPieceId ? canUseAbility(state, selectedPieceId) : false;
  const canInteract = mode === "local" || (playerColor && playerColor === state.currentTurn && !state.winner);
  const onlineGameReady =
    mode === "online" &&
    Boolean(roomCode) &&
    Boolean(roomData?.players?.white) &&
    Boolean(roomData?.players?.black);
  const showBoard = (mode === "local" && localGameStarted) || onlineGameReady;

  function clearSelection() {
    setSelectedPieceId(null);
    setAbilityMode(false);
  }

  async function commitState(nextState) {
    setState(nextState);
    if (nextState.pendingAbility?.type === "knight") {
      setSelectedPieceId(nextState.pendingAbility.pieceId);
      setAbilityMode(true);
    } else {
      clearSelection();
    }
    if (mode === "online" && roomCode && !nextState.pendingPromotion) {
      await updateRoomState(roomCode, nextState);
    }
  }

  async function handleSquareClick(square) {
    if (!canInteract) {
      return;
    }

    if (selectedPieceId && abilityMode) {
      const nextState = applyAbility(state, selectedPieceId, square);
      if (nextState !== state) {
        await commitState(nextState);
        return;
      }
      if (state.pendingAbility) {
        return;
      }
    }

    if (selectedPieceId && !abilityMode) {
      const nextState = applyMove(state, selectedPieceId, square);
      if (nextState !== state) {
        await commitState(nextState);
        return;
      }
    }

    if (state.pendingAbility) {
      return;
    }

    const clickedPiece = state.board[square.y][square.x];
    if (clickedPiece && clickedPiece.color === state.currentTurn) {
      setSelectedPieceId(clickedPiece.id);
      setAbilityMode(false);
    } else {
      clearSelection();
    }
  }

  async function handleReset() {
    const nextState = createInitialState();
    if (mode === "local") {
      setLocalGameStarted(true);
    }
    await commitState(nextState);
  }

  async function handlePromotion(choice) {
    const nextState = resolvePromotion(state, choice);
    await commitState(nextState);
  }

  async function handleCreateRoom() {
    if (!authUser) {
      setStatusMessage("Sign in first.");
      return;
    }

    try {
      setIsCreatingRoom(true);
      setStatusMessage("Creating room...");
      const initialState = createInitialState();
      const createdRoom = await createRoom(initialState, authUser);
      setMode("online");
      setRoomCode(createdRoom.code);
      setPlayerSeat(createdRoom.assignedSeat);
      setRoomData(createdRoom);
      setState(initialState);
      setStatusMessage(`Room ${createdRoom.code} created. You are ${createdRoom.assignedSeat}.`);
    } catch (error) {
      console.error("Create room failed", error);
      setStatusMessage(error?.message || "Failed to create room.");
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function handleJoinRoom() {
    if (!authUser) {
      setStatusMessage("Sign in first.");
      return;
    }

    try {
      setIsJoiningRoom(true);
      const normalizedCode = roomCodeInput.toUpperCase();
      setStatusMessage(`Joining room ${normalizedCode}...`);
      const joinedRoom = await joinRoom(normalizedCode, authUser);
      setMode("online");
      setRoomCode(normalizedCode);
      setPlayerSeat(joinedRoom.assignedSeat);
      setRoomData(joinedRoom);
      setState(joinedRoom.state);
      setStatusMessage(`Joined room ${normalizedCode}.`);
    } catch (error) {
      console.error("Join room failed", error);
      setStatusMessage(error?.message || "Failed to join room.");
    } finally {
      setIsJoiningRoom(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Arcane Chess</p>
          <h1>Multiplayer strategy chess with shared cooldown abilities and dynamic board events.</h1>
        </div>
        <div className="header-actions">
          <button type="button" className={mode === "local" ? "tab active" : "tab"} onClick={() => setMode("local")}>
            Local
          </button>
          <button type="button" className={mode === "online" ? "tab active" : "tab"} onClick={() => setMode("online")}>
            Online
          </button>
        </div>
      </header>

      {eventToast ? (
        <div className="event-toast-overlay">
          <div className="event-toast">
            <p className="event-toast-title">{eventToast.title}</p>
            <p className="event-toast-description">{eventToast.description}</p>
          </div>
        </div>
      ) : null}

      {mode === "online" ? (
        <OnlineLobby
          firebaseReady={hasFirebaseConfig}
          authUser={authUser}
          roomCodeInput={roomCodeInput}
          onRoomCodeInput={setRoomCodeInput}
          onGuestSignIn={() => signInGuest().catch((error) => setStatusMessage(error.message))}
          onGoogleSignIn={() => signInGoogle().catch((error) => setStatusMessage(error.message))}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          statusMessage={statusMessage}
          isCreatingRoom={isCreatingRoom}
          isJoiningRoom={isJoiningRoom}
        />
      ) : null}

      {!showBoard ? (
        <section className="lobby-card">
          {mode === "local" ? (
            <>
              <h2>Local Multiplayer</h2>
              <p>Start a same-device match to reveal the board.</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setState(createInitialState());
                  setLocalGameStarted(true);
                  setStatusMessage("");
                }}
              >
                Start Local Match
              </button>
            </>
          ) : (
            <>
              <h2>Online Match</h2>
              <p>Create a room or join one with a code to start playing.</p>
            </>
          )}
        </section>
      ) : (
        <main className="game-layout">
          <Board
            state={state}
            perspective={perspective}
            selectedPieceId={selectedPieceId}
            moveTargets={moveTargets}
            abilityTargets={abilityTargets}
            visibleSquares={visibleSquares}
            onSquareClick={handleSquareClick}
          />
          <ControlPanel
            state={state}
            selectedPiece={selectedPiece}
            abilityReady={abilityReady}
          abilityMode={abilityMode}
          onToggleAbilityMode={() => setAbilityMode((current) => !current)}
          onReset={handleReset}
          mode={mode}
          roomCode={roomCode}
          playerColor={playerColor}
          pendingAbility={state.pendingAbility}
          />
        </main>
      )}

      <PromotionModal
        open={Boolean(state.pendingPromotion)}
        color={state.pendingPromotion?.color}
        onChoose={handlePromotion}
      />
    </div>
  );
}
