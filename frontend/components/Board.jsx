import { PIECE_LABELS } from "../gameLogic/constants";
import { getPieceState } from "../gameLogic/engine";
import { toSquareKey } from "../gameLogic/helpers";

function Square({
  square,
  piece,
  isDark,
  isSelected,
  isMoveTarget,
  isAbilityTarget,
  isVisible,
  isEventTile,
  cooldown,
  onClick,
}) {
  const classes = [
    "board-square",
    isDark ? "dark" : "light",
    isSelected ? "selected" : "",
    isVisible && isMoveTarget ? "move-target" : "",
    isVisible && isAbilityTarget ? "ability-target" : "",
    isVisible && isEventTile ? `event-${isEventTile}` : "",
    !isVisible ? "fogged" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={() => onClick(square)}>
      {isVisible && piece ? (
        <span className={`piece ${piece.color} ${piece.status.explosive ? "explosive" : ""}`}>
          {PIECE_LABELS[piece.color][piece.type]}
        </span>
      ) : (
        <span className="piece-hidden" />
      )}
      {isVisible && cooldown > 0 ? <span className="cooldown-badge">{cooldown}</span> : null}
    </button>
  );
}

export default function Board({
  state,
  perspective,
  selectedPieceId,
  moveTargets,
  abilityTargets,
  visibleSquares,
  onSquareClick,
}) {
  const rows = perspective === "black" ? [...state.board].reverse() : state.board;

  const eventTiles = new Map();
  if (state.activeEvent?.tiles) {
    for (const tile of state.activeEvent.tiles) {
      eventTiles.set(toSquareKey(tile), state.activeEvent.type);
    }
  }

  return (
    <div className="board-shell">
      <div className="board-grid">
        {rows.map((row, visualRow) => {
          const actualY = perspective === "black" ? 7 - visualRow : visualRow;
          const squares = perspective === "black" ? [...row].reverse() : row;
          return squares.map((piece, visualCol) => {
            const actualX = perspective === "black" ? 7 - visualCol : visualCol;
            const square = { x: actualX, y: actualY };
            const selectedLookup = selectedPieceId ? getPieceState(state, selectedPieceId) : null;
            const selected =
              selectedLookup &&
              selectedLookup.position.x === square.x &&
              selectedLookup.position.y === square.y;
            const isMoveTarget = moveTargets.some((target) => target.x === square.x && target.y === square.y);
            const isAbilityTarget = abilityTargets.some(
              (target) => target.x === square.x && target.y === square.y,
            );
            const key = toSquareKey(square);
            const visible = visibleSquares.has(key);
            const cooldown = piece ? state.cooldowns[piece.color][piece.type] : 0;

            return (
              <Square
                key={key}
                square={square}
                piece={piece}
                isDark={(actualX + actualY) % 2 === 1}
                isSelected={selected}
                isMoveTarget={isMoveTarget}
                isAbilityTarget={isAbilityTarget}
                isVisible={visible}
                isEventTile={eventTiles.get(key)}
                cooldown={cooldown}
                onClick={onSquareClick}
              />
            );
          });
        })}
      </div>
    </div>
  );
}
