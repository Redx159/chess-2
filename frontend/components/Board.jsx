import { PIECE_IMAGE_ASSETS } from "../gameLogic/constants";
import { getPieceState } from "../gameLogic/engine";
import { toSquareKey } from "../gameLogic/helpers";

function Square({
  square,
  piece,
  isDark,
  isSelected,
  isLastMoveFrom,
  isLastMoveTo,
  isMoveTarget,
  isAbilityTarget,
  isVisible,
  isEventTile,
  cooldown,
  showPrivateState,
  onClick,
}) {
  const classes = [
    "board-square",
    isDark ? "dark" : "light",
    isSelected ? "selected" : "",
    isVisible && isLastMoveFrom ? "last-move-from" : "",
    isVisible && isLastMoveTo ? "last-move-to" : "",
    isVisible && isMoveTarget ? "move-target" : "",
    isVisible && isAbilityTarget ? "ability-target" : "",
    isVisible && isEventTile ? `event-${isEventTile}` : "",
    !isVisible ? "fogged" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={() => onClick(square)}>
      {isVisible && isMoveTarget ? (
        <span className={`target-indicator move ${piece ? "occupied" : "empty"}`} />
      ) : null}
      {isVisible && isAbilityTarget ? (
        <span className={`target-indicator ability ${piece ? "occupied" : "empty"}`} />
      ) : null}
      {isVisible && piece ? (
        <span
          className={`piece ${piece.color} ${showPrivateState && piece.status.explosive ? "explosive" : ""}`}
        >
          <img
            className="piece-image"
            src={PIECE_IMAGE_ASSETS[piece.color][piece.type]}
            alt={`${piece.color} ${piece.type}`}
            draggable="false"
          />
        </span>
      ) : (
        <span className="piece-hidden" />
      )}
      {isVisible && showPrivateState && cooldown > 0 ? <span className="cooldown-badge">{cooldown}</span> : null}
    </button>
  );
}

export default function Board({
  state,
  perspective,
  viewerColor,
  revealAllState = false,
  selectedPieceId,
  lastMoveSquares,
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
            const isLastMoveFrom = lastMoveSquares?.from === key;
            const isLastMoveTo = lastMoveSquares?.to === key;
            const showPrivateState = Boolean(
              piece && (revealAllState || !viewerColor || piece.color === viewerColor),
            );

            return (
              <Square
                key={key}
                square={square}
                piece={piece}
                isDark={(actualX + actualY) % 2 === 1}
                isSelected={selected}
                isLastMoveFrom={isLastMoveFrom}
                isLastMoveTo={isLastMoveTo}
                isMoveTarget={isMoveTarget}
                isAbilityTarget={isAbilityTarget}
                isVisible={visible}
                isEventTile={eventTiles.get(key)}
                cooldown={cooldown}
                showPrivateState={showPrivateState}
                onClick={onSquareClick}
              />
            );
          });
        })}
      </div>
    </div>
  );
}
