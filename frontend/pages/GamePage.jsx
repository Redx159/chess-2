import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Board from "../components/Board";
import OnlineLobby from "../components/OnlineLobby";
import PromotionModal from "../components/PromotionModal";
import { auth, hasFirebaseConfig, signInGoogle, signInGuest } from "../../backend/firebase";
import {
  createRoom,
  joinRoom,
  leaveFinishedRoom,
  subscribeToMatchHistory,
  subscribeToRoom,
  updateRoomState,
} from "../../backend/gameService";
import { ABILITY_DESCRIPTIONS, ABILITY_IMAGE_ASSETS, EVENT_TYPES, PIECE_TYPES } from "../gameLogic/constants";
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

const REMATCH_TIMEOUT_MS = 60_000;
const TURN_TIMEOUT_MS = 60_000;

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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

function RulesPanel({ t }) {
  return (
    <div className="rules-card">
      <h2>{t("guideTitle")}</h2>
      <p>{t("guideIntro")}</p>

      <div className="rules-grid">
        <div className="rules-section">
          <h3>{t("abilitiesTitle")}</h3>
          <div className="rules-list">
            {PIECE_TYPES.map((type) => (
              <article key={type} className="rule-item">
                <h4>{t(type)}</h4>
                <p>{t(`abilityGuide_${type}`) || ABILITY_DESCRIPTIONS[type]}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rules-section">
          <h3>{t("eventsTitle")}</h3>
          <div className="rules-list">
            {Object.keys(EVENT_TYPES).map((eventType) => (
              <article key={eventType} className="rule-item">
                <h4>{t(`eventGuideTitle_${eventType}`)}</h4>
                <p>{t(`eventGuide_${eventType}`)}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  const language = useMemo(() => detectLanguage(), []);
  const t = useMemo(() => createTranslator(language), [language]);
  const [menuTab, setMenuTab] = useState("local");
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
  const [historyEntries, setHistoryEntries] = useState([]);
  const [opponentLeftAfterGame, setOpponentLeftAfterGame] = useState(false);
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("arcane-chess-player-name") || "";
  });
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [pendingActionConfirm, setPendingActionConfirm] = useState(null);
  const previousEventKeyRef = useRef(null);
  const eventToastTimeoutRef = useRef(null);
  const pendingConfirmTimeoutRef = useRef(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const handledTurnTimeoutRef = useRef(null);
  const handledRematchTimeoutRef = useRef(null);

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
    if (!authUser) {
      return;
    }
    setPlayerName((current) => {
      if (current.trim()) {
        return current;
      }
      return authUser.displayName || "";
    });
  }, [authUser]);

  useEffect(() => {
    if (!roomCode) {
      setOpponentLeftAfterGame(false);
      return undefined;
    }
    const unsubscribe = subscribeToRoom(
      roomCode,
      (data) => {
        setRoomData(data);
        setState(data.state);
        if (data.postGameExitBy && data.postGameExitBy !== authUser?.uid && data.state?.winner) {
          setOpponentLeftAfterGame(true);
          clearPendingConfirm();
          setStatusMessage(t("opponentLeftLobby"));
        } else {
          setOpponentLeftAfterGame(false);
        }
      },
      (error) => setStatusMessage(error.message),
    );
    return unsubscribe;
  }, [authUser?.uid, roomCode, t]);

  useEffect(() => {
    if (!authUser || !hasFirebaseConfig) {
      setHistoryEntries([]);
      return undefined;
    }
    return subscribeToMatchHistory(
      authUser.uid,
      (entries) => {
        setHistoryEntries(
          entries.map((entry) => {
            const isWhite = entry.players?.white?.uid === authUser.uid;
            const opponent = isWhite ? entry.players?.black : entry.players?.white;
            const resultLabel =
              entry.winner === "draw"
                ? t("resultDrawShort")
                : entry.winner === (isWhite ? "white" : "black")
                  ? t("resultWin")
                  : t("resultLoss");
            return {
              id: entry.id,
              opponentName: t("against", { name: opponent?.name || "Guest" }),
              resultLabel,
            };
          }),
        );
      },
      (error) => setStatusMessage(error.message),
    );
  }, [authUser, t]);

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
    if (eventToastTimeoutRef.current) {
      window.clearTimeout(eventToastTimeoutRef.current);
      eventToastTimeoutRef.current = null;
    }
    if (eventKey && eventKey !== previousEventKeyRef.current) {
      setEventToast(eventMessageFor(t, state.activeEvent));
      eventToastTimeoutRef.current = window.setTimeout(() => {
        setEventToast(null);
        eventToastTimeoutRef.current = null;
      }, 3200);
      previousEventKeyRef.current = eventKey;
    }
    previousEventKeyRef.current = eventKey;
    return undefined;
  }, [state.activeEvent, t]);

  useEffect(
    () => () => {
      if (eventToastTimeoutRef.current) {
        window.clearTimeout(eventToastTimeoutRef.current);
      }
      if (pendingConfirmTimeoutRef.current) {
        window.clearTimeout(pendingConfirmTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

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
  const abilityIcon = selectedPiece ? ABILITY_IMAGE_ASSETS[selectedPiece.type] : null;
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
  const rematchDeadlineAt = state.gameEndedAt ? state.gameEndedAt + REMATCH_TIMEOUT_MS : null;
  const rematchTimeLeftMs = rematchDeadlineAt ? Math.max(0, rematchDeadlineAt - nowTick) : 0;
  const turnDeadlineAt = !state.winner && state.turnStartedAt ? state.turnStartedAt + TURN_TIMEOUT_MS : null;
  const turnTimeLeftMs = turnDeadlineAt ? Math.max(0, turnDeadlineAt - nowTick) : 0;
  const turnTimerText = turnDeadlineAt ? formatCountdown(turnTimeLeftMs) : "";

  useEffect(() => {
    if (!(mode === "online" && roomCode && state.winner && state.gameEndedAt)) {
      handledRematchTimeoutRef.current = null;
      return;
    }
    if (rematchTimeLeftMs > 0) {
      return;
    }
    const timeoutKey = `${roomCode}-${state.gameEndedAt}`;
    if (handledRematchTimeoutRef.current === timeoutKey) {
      return;
    }
    handledRematchTimeoutRef.current = timeoutKey;
    setStatusMessage(t("rematchExpired"));
    void resetToLobby("online");
  }, [mode, rematchTimeLeftMs, roomCode, state.gameEndedAt, state.winner, t]);

  useEffect(() => {
    if (!(mode === "online" && roomCode && onlineGameReady && !state.winner && state.turnStartedAt)) {
      handledTurnTimeoutRef.current = null;
      return;
    }
    if (turnTimeLeftMs > 0) {
      return;
    }
    const timeoutKey = `${roomCode}-${state.currentTurn}-${state.turnStartedAt}`;
    if (handledTurnTimeoutRef.current === timeoutKey) {
      return;
    }
    handledTurnTimeoutRef.current = timeoutKey;
    void commitState(resignGame(state, state.currentTurn));
  }, [mode, onlineGameReady, roomCode, state, turnTimeLeftMs]);

  function clearSelection() {
    setSelectedPieceId(null);
    setAbilityMode(false);
  }

  function clearPendingConfirm() {
    setPendingActionConfirm(null);
    if (pendingConfirmTimeoutRef.current) {
      window.clearTimeout(pendingConfirmTimeoutRef.current);
      pendingConfirmTimeoutRef.current = null;
    }
  }

  function startPendingConfirm(action) {
    clearPendingConfirm();
    setPendingActionConfirm(action);
    pendingConfirmTimeoutRef.current = window.setTimeout(() => {
      setPendingActionConfirm(null);
      pendingConfirmTimeoutRef.current = null;
    }, 2600);
  }

  async function resetToLobby(nextMode = mode) {
    if (nextMode === "online" && roomCode && authUser?.uid && state.winner) {
      try {
        await leaveFinishedRoom(roomCode, authUser.uid);
      } catch (error) {
        console.error("Leave room failed", error);
      }
    }
    clearSelection();
    setEventToast(null);
    clearPendingConfirm();
    setStatusMessage("");
    setState(createInitialState());
    setRoomData(null);
    setOpponentLeftAfterGame(false);
    setRoomCode("");
    setRoomCodeInput("");
    setPlayerSeat(null);
    setLocalHistory([]);
    if (nextMode === "local") {
      setLocalGameStarted(false);
      setMode("local");
      setMenuTab("local");
      return;
    }
    setMode("online");
    setMenuTab("online");
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
        clearPendingConfirm();
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
        clearPendingConfirm();
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
    setMenuTab("local");
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
      setMenuTab("online");
      setRoomCode(createdRoom.code);
      setPlayerSeat(createdRoom.assignedSeat);
      setRoomData(createdRoom);
      setOpponentLeftAfterGame(false);
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
      setMenuTab("online");
      setRoomCode(normalizedCode);
      setPlayerSeat(joinedRoom.assignedSeat);
      setRoomData(joinedRoom);
      setOpponentLeftAfterGame(false);
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
    setStatusMessage("");
    signInGuest().catch((error) => setStatusMessage(error.message));
  }

  async function handleGoogleSignIn() {
    setStatusMessage("");
    signInGoogle().catch((error) => setStatusMessage(error.message));
  }

  async function handleResign() {
    if (pendingActionConfirm !== "resign") {
      startPendingConfirm("resign");
      return;
    }
    clearPendingConfirm();
    const nextState = resignGame(state, actorColor);
    await commitState(nextState);
  }

  async function handleDrawAction() {
    if (pendingActionConfirm !== "draw") {
      startPendingConfirm("draw");
      return;
    }
    clearPendingConfirm();
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
    clearPendingConfirm();
    if (mode === "local") {
      const nextState = createInitialState();
      setLocalHistory([]);
      setLocalGameStarted(true);
      setOpponentLeftAfterGame(false);
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
  const whitePlayerName = roomData?.players?.white?.name || t("white");
  const blackPlayerName = roomData?.players?.black?.name || t("black");
  const opponentLeftLobby = Boolean(state.winner && opponentLeftAfterGame);
  const drawButtonLabel =
    pendingActionConfirm === "draw"
      ? t("confirmDraw")
      : pendingDrawFromOpponent
        ? t("acceptDraw")
        : t("callDraw");
  const resignButtonLabel = pendingActionConfirm === "resign" ? t("confirmResign") : t("resign");
  const effectiveRematchLabel = opponentLeftLobby ? t("opponentLeftLabel") : rematchLabel;
  const effectiveResultDescription = opponentLeftLobby ? t("opponentLeftLobby") : resultDescription(t, state);
  const rematchCountdownHint =
    mode === "online" && state.winner ? t("rematchCountdown", { time: formatCountdown(rematchTimeLeftMs) }) : "";
  const combinedRematchHint = [opponentLeftLobby ? t("opponentLeftLobby") : rematchHint, rematchCountdownHint]
    .filter(Boolean)
    .join(" ");

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
                className={menuTab === "local" ? "tab active" : "tab"}
                onClick={() => {
                  setMenuTab("local");
                  setMode("local");
                }}
              >
                {t("local")}
              </button>
              <button
                type="button"
                className={menuTab === "online" ? "tab active" : "tab"}
                onClick={() => {
                  setMenuTab("online");
                  setMode("online");
                }}
              >
                {t("online")}
              </button>
              <button
                type="button"
                className={menuTab === "guide" ? "tab active" : "tab"}
                onClick={() => setMenuTab("guide")}
              >
                {t("guide")}
              </button>
            </div>
          </header>

          {menuTab === "online" && !roomCode ? (
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
              historyEntries={historyEntries}
            />
          ) : null}

          {!showBoard ? (
            <section className="lobby-card">
              {menuTab === "guide" ? (
                <RulesPanel t={t} />
              ) : mode === "local" ? (
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
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void resetToLobby("online");
                    }}
                  >
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
              <div className="players-ribbon">
                <span className={`player-pill ${state.currentTurn === "white" ? "active" : ""}`}>
                  {whitePlayerName}
                </span>
                <span className={`player-pill ${state.currentTurn === "black" ? "active" : ""}`}>
                  {blackPlayerName}
                </span>
              </div>
              {inGameStatus ? <div className="status-ribbon">{inGameStatus}</div> : null}
              {mode === "online" && !state.winner ? (
                <div className="status-ribbon timer-ribbon">
                  {t("turnTimer", { time: turnTimerText })}
                </div>
              ) : null}
            </div>

            <div className="toolbar-group">
              <ActionButton
                label={drawButtonLabel}
                onClick={handleDrawAction}
                disabled={!actorColor || Boolean(state.winner)}
              />
              <ActionButton
                label={resignButtonLabel}
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
                className={`ability-fab ${abilityMode ? "active" : ""} ${selectedPiece ? `ability-${selectedPiece.type}` : ""}`}
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
                {abilityIcon ? (
                  <img className="ability-icon-image" src={abilityIcon} alt={selectedPiece?.type || "ability"} />
                ) : (
                  <span className="ability-icon">✦</span>
                )}
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
        description={effectiveResultDescription}
        onBackToLobby={() => {
          void resetToLobby(mode);
        }}
        onRematch={handleRematch}
        rematchLabel={effectiveRematchLabel}
        rematchDisabled={opponentLeftLobby || (mode === "online" && playerRematchVoted)}
        rematchHint={combinedRematchHint}
        t={t}
      />
    </div>
  );
}
