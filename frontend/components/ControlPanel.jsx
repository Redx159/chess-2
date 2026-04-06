import { ABILITY_DESCRIPTIONS } from "../gameLogic/constants";
import { getEventSummary } from "../gameLogic/engine";

export default function ControlPanel({
  state,
  selectedPiece,
  abilityReady,
  abilityMode,
  onToggleAbilityMode,
  onReset,
  mode,
  roomCode,
  playerColor,
  pendingAbility,
}) {
  return (
    <aside className="panel">
      <section className="panel-card">
        <h2>Match</h2>
        <p>Turn: {state.turnCount + 1}</p>
        <p>Current side: {state.currentTurn}</p>
        <p>{getEventSummary(state.activeEvent)}</p>
        <p className="winner-text">{state.winner ? `${state.winner} wins by capturing the king.` : "King capture ends the game."}</p>
      </section>

      <section className="panel-card">
        <h2>Selection</h2>
        {selectedPiece ? (
          <>
            <p>
              {selectedPiece.color} {selectedPiece.type}
            </p>
            <p>{ABILITY_DESCRIPTIONS[selectedPiece.type]}</p>
            <button
              type="button"
              className="primary-button"
              disabled={!abilityReady || Boolean(pendingAbility)}
              onClick={onToggleAbilityMode}
            >
              {pendingAbility ? "Ability In Progress" : abilityMode ? "Cancel Ability" : "Use Ability"}
            </button>
            {pendingAbility?.type === "knight" ? (
              <p className="winner-text">Choose the knight's second jump to finish the turn.</p>
            ) : null}
            {!abilityReady ? (
              <p className="muted">Ability on cooldown, blocked, or not your turn.</p>
            ) : null}
          </>
        ) : (
          <p className="muted">Select a piece to inspect moves and abilities.</p>
        )}
      </section>

      <section className="panel-card">
        <h2>Mode</h2>
        <p>{mode === "local" ? "Local multiplayer" : "Online multiplayer"}</p>
        {mode === "online" ? <p>Seat: {playerColor || "spectator"}</p> : null}
        {roomCode ? <p>Room code: {roomCode}</p> : null}
        <button type="button" className="secondary-button" onClick={onReset}>
          Reset Match
        </button>
      </section>

      <section className="panel-card">
        <h2>Recent Actions</h2>
        <div className="history-list">
          {state.moveHistory.slice(-8).reverse().map((entry, index) => (
            <p key={`${entry}-${index}`}>{entry}</p>
          ))}
        </div>
      </section>
    </aside>
  );
}
