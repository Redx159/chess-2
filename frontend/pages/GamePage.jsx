import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Board from "../components/Board";
import OnlineLobby from "../components/OnlineLobby";
import PromotionModal from "../components/PromotionModal";
import { auth, hasFirebaseConfig, signInGoogle, signInGuest } from "../../backend/firebase";
import { createRoom, joinRoom, subscribeToRoom, updateRoomState } from "../../backend/gameService";
import { PIECE_LABELS } from "../gameLogic/constants";
import {
  applyAbility,
  applyMove,
  canUseAbility,
  cloneGameState,
  createInitialState,
  getAbilityTargets,
  getLegalMoves,
  getPieceState,
  getVisibleSquares,
  offerOrAcceptDraw,
  resignGame,
  resolvePromotion,
  voteForRematch,
} from "../gameLogic/engine";
import { toSquareKey } from "../gameLogic/helpers";
import { createTranslator, detectLanguage } from "../i18n";

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

function ActionButton({ label, onClick, disabled = false, title, tone = "default" }) {
  return (
    <button
      type="button"
      className={`hud-button ${tone !== "default" ? `hud-button-${tone}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
    >
      {label}
    </button>
  );
}

function GameResultModal({
  open,
  title,
  description,
  onBackToLobby,
  onRematch,
  rematchLabel,
  rematchDisabled,
  rematchHint,
  t,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card result-card">
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="promotion-grid">
          <button type="button" className="secondary-button" onClick={onBackToLobby}>
            {t("backToLobby")}
          </button>
          <button type="button" className="primary-button" onClick={onRematch} disabled={rematchDisabled}>
            {rematchLabel}
          </button>
        </div>
        {rematchHint ? <p className="muted">{rematchHint}</p> : null}
      </div>
    </div>
  );
}

function eventMessageFor(t, event) {
  if (!event) {
    return null;
  }

  if (event.type === "lava") {
    return {
      title: t("eventLavaTitle"),
      description: t("eventLavaDescription"),
    };
  }
  if (event.type === "portals") {
    return {
      title: t("eventPortalsTitle"),
      description: t("eventPortalsDescription"),
    };
  }
  if (event.type === "fog") {
    return {
      title: t("eventFogTitle"),
      description: t("eventFogDescription"),
    };
  }
  return {
    title: t("eventRestoreTitle"),
    description: t("eventRestoreDescription"),
  };
}

function resultDescription(t, state) {
  if (state.endReason === "resign") {
    const loser = state.winner === "white" ? t("black") : t("white");
    return t("resultByResign", { loser });
  }
  if (state.endReason === "draw") {
    return t("resultByDraw");
  }
  if (state.endReason === "capture") {
    return t("resultByCapture");
  }
  return t("resultByUnknown");
}

export default function GamePage() {
  const language = useMemo(() => detectLanguage(), []);
  const t = useMemo(() => createTranslator(language), [language]);
  const [mode, setMode] = useState("local");
  const [state, setState] = useState(createInitialState);
  const [localGameStarted, setLocalGameStarted] = useState(false);
  const [localHistory, setLocalHistory] = useState([]);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [abilityMode, setAbilityMode] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [eventToast, setEventToast] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [playerSeat, setPlayerSeat] = useState(null);
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("arcane-chess-player-name") || "";
  });
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const previousEventKeyRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("arcane-chess-player-name", playerName);
    }
  }, [playerName]);

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
      setEventToast(eventMessageFor(t, state.activeEvent));
      const timeoutId = window.setTimeout(() => setEventToast(null), 3200);
      previousEventKeyRef.current = eventKey;
      return () => window.clearTimeout(timeoutId);
    }
    previousEventKeyRef.current = eventKey;
    return undefined;
  }, [state.activeEvent, t]);

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
  const actorColor = mode === "online" ? playerColor : state.currentTurn;
  const abilityCooldown = selectedPiece ? state.cooldowns[selectedPiece.color][selectedPiece.type] : 0;
  const abilitySymbol = selectedPiece ? PIECE_LABELS[selectedPiece.color][selectedPiece.type] : "✦";
  const waitingForOpponent = mode === "online" && roomCode && !onlineGameReady;
  const pendingDrawFromOpponent = Boolean(
    actorColor && state.drawOfferBy && state.drawOfferBy !== actorColor,
  );
  const playerRematchVoted = Boolean(actorColor && state.rematchVotes?.[actorColor]);
  const rematchVotesCount = Number(Boolean(state.rematchVotes?.white)) + Number(Boolean(state.rematchVotes?.black));
  const lastMoveSquares = useMemo(() => {
    if (!state.lastAction?.from && !state.lastAction?.to) {
      return null;
    }
    return {
      from: state.lastAction?.from ? toSquareKey(state.lastAction.from) : null,
      to: state.lastAction?.to ? toSquareKey(state.lastAction.to) : null,
    };
  }, [state.lastAction]);

  function clearSelection() {
    setSelectedPieceId(null);
    setAbilityMode(false);
  }

  function resetToLobby(nextMode = mode) {
    clearSelection();
    setEventToast(null);
    setStatusMessage("");
    setState(createInitialState());
    setRoomData(null);
    setRoomCode("");
    setRoomCodeInput("");
    setPlayerSeat(null);
    setLocalHistory([]);
    if (nextMode === "local") {
      setLocalGameStarted(false);
      setMode("local");
      return;
    }
    setMode("online");
    setLocalGameStarted(false);
  }

  async function commitState(nextState) {
    if (nextState === state) {
      return;
    }
    if (mode === "local") {
      setLocalHistory((history) => [...history, cloneGameState(state)]);
    }
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

  function ensurePlayerName() {
    if (playerName.trim()) {
      return true;
    }
    setStatusMessage(t("chooseUsernameFirst"));
    return false;
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

  function startLocalMatch() {
    clearSelection();
    setMode("local");
    setState(createInitialState());
    setLocalHistory([]);
    setLocalGameStarted(true);
    setStatusMessage("");
  }

  async function handlePromotion(choice) {
    const nextState = resolvePromotion(state, choice);
    await commitState(nextState);
  }

  async function handleCreateRoom() {
    if (!authUser) {
      setStatusMessage(t("signInFirst"));
      return;
    }
    if (!ensurePlayerName()) {
      return;
    }

    try {
      setIsCreatingRoom(true);
      setStatusMessage(t("creatingRoomStatus"));
      const initialState = createInitialState();
      const createdRoom = await createRoom(initialState, authUser, playerName);
      setMode("online");
      setRoomCode(createdRoom.code);
      setPlayerSeat(createdRoom.assignedSeat);
      setRoomData(createdRoom);
      setState(initialState);
      setStatusMessage(
        t("roomCreated", {
          code: createdRoom.code,
          seat: t(createdRoom.assignedSeat),
        }),
      );
    } catch (error) {
      console.error("Create room failed", error);
      setStatusMessage(error?.message || "Failed to create room.");
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function handleJoinRoom() {
    if (!authUser) {
      setStatusMessage(t("signInFirst"));
      return;
    }
    if (!ensurePlayerName()) {
      return;
    }

    try {
      setIsJoiningRoom(true);
      const normalizedCode = roomCodeInput.toUpperCase();
      setStatusMessage(t("joiningRoomStatus", { code: normalizedCode }));
      const joinedRoom = await joinRoom(normalizedCode, authUser, playerName);
      setMode("online");
      setRoomCode(normalizedCode);
      setPlayerSeat(joinedRoom.assignedSeat);
      setRoomData(joinedRoom);
      setState(joinedRoom.state);
      setStatusMessage(t("joinedRoom", { code: normalizedCode }));
    } catch (error) {
      console.error("Join room failed", error);
      setStatusMessage(error?.message || "Failed to join room.");
    } finally {
      setIsJoiningRoom(false);
    }
  }

  async function handleGuestSignIn() {
    if (!ensurePlayerName()) {
      return;
    }
    signInGuest().catch((error) => setStatusMessage(error.message));
  }

  async function handleGoogleSignIn() {
    if (!ensurePlayerName()) {
      return;
    }
    signInGoogle().catch((error) => setStatusMessage(error.message));
  }

  async function handleResign() {
    const nextState = resignGame(state, actorColor);
    await commitState(nextState);
  }

  async function handleDrawAction() {
    const nextState = offerOrAcceptDraw(state, actorColor);
    await commitState(nextState);
  }

  function handleUndo() {
    if (!localHistory.length) {
      return;
    }
    const previous = localHistory[localHistory.length - 1];
    setLocalHistory((history) => history.slice(0, -1));
    setState(cloneGameState(previous));
    clearSelection();
  }

  async function handleRematch() {
    clearSelection();
    setEventToast(null);
    if (mode === "local") {
      const nextState = createInitialState();
      setLocalHistory([]);
      setLocalGameStarted(true);
      setState(nextState);
      return;
    }
    const nextState = voteForRematch(state, actorColor);
    await commitState(nextState);
  }

  const resultTitle =
    state.winner === "draw"
      ? t("drawTitle")
      : t("winnerTitle", { winner: t(state.winner || "white") });
  const inGameStatus = pendingDrawFromOpponent
    ? t("drawOffered", { color: t(state.drawOfferBy) })
    : waitingForOpponent
      ? t("waitingForOpponent", { code: roomCode })
      : "";
  const rematchLabel =
    mode === "online" ? (playerRematchVoted ? t("rematchVoted") : t("voteRematch")) : t("rematch");
  const rematchHint =
    mode === "online" && state.winner && rematchVotesCount > 0 ? t("rematchPending") : "";

  return (
    <div className={`app-shell ${showBoard ? "in-game-shell" : ""}`}>
      {!showBoard ? (
        <>
          <header className="hero">
            <div>
              <p className="eyebrow">{t("appName")}</p>
              <h1>{t("appTagline")}</h1>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className={mode === "local" ? "tab active" : "tab"}
                onClick={() => setMode("local")}
              >
                {t("local")}
              </button>
              <button
                type="button"
                className={mode === "online" ? "tab active" : "tab"}
                onClick={() => setMode("online")}
              >
                {t("online")}
              </button>
            </div>
          </header>

          {mode === "online" && !roomCode ? (
            <OnlineLobby
              t={t}
              firebaseReady={hasFirebaseConfig}
              authUser={authUser}
              playerName={playerName}
              onPlayerNameChange={setPlayerName}
              roomCodeInput={roomCodeInput}
              onRoomCodeInput={setRoomCodeInput}
              onGuestSignIn={handleGuestSignIn}
              onGoogleSignIn={handleGoogleSignIn}
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
                  <h2>{t("localMultiplayer")}</h2>
                  <p>{t("startLocalHint")}</p>
                  <button type="button" className="primary-button" onClick={startLocalMatch}>
                    {t("startLocalMatch")}
                  </button>
                </>
              ) : waitingForOpponent ? (
                <>
                  <h2>{t("onlineMultiplayer")}</h2>
                  <p>{t("waitingForOpponent", { code: roomCode })}</p>
                  {playerSeat ? <p className="muted">{t("yourSeat", { seat: t(playerSeat) })}</p> : null}
                  <button type="button" className="secondary-button" onClick={() => resetToLobby("online")}>
                    {t("backToLobby")}
                  </button>
                </>
              ) : (
                <>
                  <h2>{t("onlineMultiplayer")}</h2>
                  <p>{t("onlineHint")}</p>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : (
        <main className="game-screen">
          {eventToast ? (
            <div className="event-toast-overlay">
              <div className="event-toast">
                <p className="event-toast-title">{eventToast.title}</p>
                <p className="event-toast-description">{eventToast.description}</p>
              </div>
            </div>
          ) : null}

          <div className="game-toolbar">
            <div className="toolbar-group">
              <ActionButton label="←" onClick={() => resetToLobby(mode)} title={t("backToLobby")} />
              {mode === "local" ? (
                <ActionButton
                  label="↶"
                  onClick={handleUndo}
                  disabled={!localHistory.length}
                  title={t("backMoveHint")}
                />
              ) : null}
            </div>

            <div className="toolbar-group toolbar-group-center">
              {inGameStatus ? <div className="status-ribbon">{inGameStatus}</div> : null}
            </div>

            <div className="toolbar-group">
              <ActionButton
                label={pendingDrawFromOpponent ? t("acceptDraw") : t("callDraw")}
                onClick={handleDrawAction}
                disabled={!actorColor || Boolean(state.winner)}
              />
              <ActionButton
                label={t("resign")}
                onClick={handleResign}
                disabled={!actorColor || Boolean(state.winner)}
                tone="danger"
              />
            </div>
          </div>

          <div className="game-board-row">
            <div className="board-stage">
            <Board
              state={state}
              perspective={perspective}
              selectedPieceId={selectedPieceId}
              lastMoveSquares={lastMoveSquares}
              moveTargets={moveTargets}
              abilityTargets={abilityTargets}
              visibleSquares={visibleSquares}
              onSquareClick={handleSquareClick}
            />
            </div>

            <div className="side-controls">
              <button
                type="button"
                className={`ability-fab ${abilityMode ? "active" : ""}`}
                onClick={() => setAbilityMode((current) => !current)}
                disabled={!selectedPiece || !abilityReady || Boolean(state.winner)}
                title={
                  abilityMode
                    ? t("cancelAbility")
                    : selectedPiece
                      ? t("useAbility")
                      : t("abilityUnavailable")
                }
              >
                <span className="ability-icon">{abilitySymbol}</span>
                {abilityCooldown > 0 ? <span className="ability-cooldown">{abilityCooldown}</span> : null}
              </button>

              {mode === "online" && state.winner && rematchVotesCount > 0 ? (
                <div className="side-note">{`${rematchVotesCount}/2`}</div>
              ) : null}

              {state.pendingAbility?.type === "knight" ? (
                <div className="ability-hint">{t("knightAbilityHint")}</div>
              ) : null}
            </div>
          </div>
        </main>
      )}

      <PromotionModal
        open={Boolean(state.pendingPromotion)}
        color={state.pendingPromotion?.color}
        onChoose={handlePromotion}
        t={t}
      />

      <GameResultModal
        open={Boolean(state.winner)}
        title={resultTitle}
        description={resultDescription(t, state)}
        onBackToLobby={() => resetToLobby(mode)}
        onRematch={handleRematch}
        rematchLabel={rematchLabel}
        rematchDisabled={mode === "online" && playerRematchVoted}
        rematchHint={rematchHint}
        t={t}
      />
    </div>
  );
}
