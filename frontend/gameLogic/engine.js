import {
  ABILITY_COOLDOWNS,
  BOARD_SIZE,
  DIRECTIONS,
  EVENT_TYPES,
  PIECE_TYPES,
} from "./constants";
import {
  cloneBoard,
  findPiece,
  fromSquareKey,
  getPieceAt,
  inBounds,
  makeEmptyBoard,
  otherColor,
  setPieceAt,
  shuffle,
  toSquareKey,
  uniqueBy,
} from "./helpers";

let pieceCounter = 0;

function nextPieceId(color, type) {
  pieceCounter += 1;
  return `${color}-${type}-${pieceCounter}`;
}

function createPiece(type, color) {
  return {
    id: nextPieceId(color, type),
    type,
    color,
    hasMoved: false,
    status: {
      stunned: 0,
      explosive: false,
      frozen: 0,
    },
  };
}

function initialBackRank(color) {
  return [
    createPiece("rook", color),
    createPiece("knight", color),
    createPiece("bishop", color),
    createPiece("queen", color),
    createPiece("king", color),
    createPiece("bishop", color),
    createPiece("knight", color),
    createPiece("rook", color),
  ];
}

export function createInitialState() {
  pieceCounter = 0;
  const now = Date.now();
  const board = makeEmptyBoard();
  board[0] = initialBackRank("black");
  board[1] = Array.from({ length: BOARD_SIZE }, () => createPiece("pawn", "black"));
  board[6] = Array.from({ length: BOARD_SIZE }, () => createPiece("pawn", "white"));
  board[7] = initialBackRank("white");

  return {
    board,
    currentTurn: "white",
    winner: null,
    turnCount: 0,
    lastAction: null,
    enPassantTarget: null,
    activeEvent: null,
    cooldowns: {
      white: structuredClone(ABILITY_COOLDOWNS),
      black: structuredClone(ABILITY_COOLDOWNS),
    },
    moveHistory: [],
    pendingPromotion: null,
    pendingAbility: null,
    abilityUsedThisTurn: false,
    drawOfferBy: null,
    rematchVotes: {
      white: false,
      black: false,
    },
    endReason: null,
    turnStartedAt: now,
    gameEndedAt: null,
  };
}

function cloneState(state) {
  return {
    ...state,
    board: cloneBoard(state.board),
    cooldowns: {
      white: { ...state.cooldowns.white },
      black: { ...state.cooldowns.black },
    },
    activeEvent: state.activeEvent ? structuredClone(state.activeEvent) : null,
    moveHistory: [...state.moveHistory],
    pendingPromotion: state.pendingPromotion ? structuredClone(state.pendingPromotion) : null,
    pendingAbility: state.pendingAbility ? structuredClone(state.pendingAbility) : null,
    abilityUsedThisTurn: Boolean(state.abilityUsedThisTurn),
    drawOfferBy: state.drawOfferBy || null,
    rematchVotes: state.rematchVotes
      ? { ...state.rematchVotes }
      : {
          white: false,
          black: false,
        },
    endReason: state.endReason || null,
    turnStartedAt: state.turnStartedAt || Date.now(),
    gameEndedAt: state.gameEndedAt || null,
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    lastAction: state.lastAction ? structuredClone(state.lastAction) : null,
  };
}

function isEnemy(piece, otherPiece) {
  return piece && otherPiece && piece.color !== otherPiece.color;
}

function isFriendly(piece, otherPiece) {
  return piece && otherPiece && piece.color === otherPiece.color;
}

function listSquares() {
  const squares = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      squares.push({ x, y });
    }
  }
  return squares;
}

function listNonKingSquares(board) {
  return listSquares().filter((position) => getPieceAt(board, position)?.type !== "king");
}

function createRandomEvent(board, rng = Math.random) {
  const pool = shuffle(Object.keys(EVENT_TYPES), rng);
  const kind = pool[0];
  const candidateSquares = shuffle(listNonKingSquares(board), rng);

  if (kind === "lava") {
    return {
      type: "lava",
      startedOnTurn: 0,
      turnsRemaining: 5,
      tiles: candidateSquares.slice(0, 3),
    };
  }

  if (kind === "portals") {
    return {
      type: "portals",
      startedOnTurn: 0,
      turnsRemaining: 5,
      tiles: candidateSquares.slice(0, 2),
    };
  }

  if (kind === "restore") {
    return {
      type: "restore",
      startedOnTurn: 0,
      turnsRemaining: 5,
      tiles: candidateSquares.slice(0, 2),
    };
  }

  return {
    type: "fog",
    startedOnTurn: 0,
    turnsRemaining: 5,
    tiles: [],
  };
}

function sweepLava(board, event, winnerRef) {
  for (const tile of event.tiles) {
    const piece = getPieceAt(board, tile);
    if (piece && piece.type !== "king") {
      setPieceAt(board, tile, null);
      if (piece.type === "king") {
        winnerRef.value = otherColor(piece.color);
      }
    }
  }
}

function applyRestore(board, event, cooldowns) {
  for (const tile of event.tiles) {
    const piece = getPieceAt(board, tile);
    if (piece) {
      cooldowns[piece.color][piece.type] = 0;
    }
  }
}

function resolveBoardEventPostMove(state) {
  if (!state.activeEvent) {
    return;
  }

  const winnerRef = { value: state.winner };
  if (state.activeEvent.type === "lava") {
    sweepLava(state.board, state.activeEvent, winnerRef);
  }
  if (state.activeEvent.type === "restore") {
    applyRestore(state.board, state.activeEvent, state.cooldowns);
  }
  state.winner = winnerRef.value;
}

function queuePromotionIfEligible(state, piece, position, defaultChoice = "queen") {
  if (!piece || piece.type !== "pawn") {
    return false;
  }
  if (position.y !== 0 && position.y !== 7) {
    return false;
  }
  state.pendingPromotion = {
    pieceId: piece.id,
    color: piece.color,
    position,
    defaultChoice,
  };
  return true;
}

function resolvePortalActivation(board, event) {
  if (!event?.tiles || event.tiles.length !== 2) {
    return null;
  }

  const [first, second] = event.tiles;
  const firstPiece = getPieceAt(board, first);
  const secondPiece = getPieceAt(board, second);

  if (firstPiece && firstPiece.type !== "king" && !secondPiece) {
    setPieceAt(board, first, null);
    setPieceAt(board, second, firstPiece);
    return { piece: firstPiece, position: second };
  }

  if (secondPiece && secondPiece.type !== "king" && !firstPiece) {
    setPieceAt(board, second, null);
    setPieceAt(board, first, secondPiece);
    return { piece: secondPiece, position: first };
  }

  return null;
}

function activateEventImmediately(state) {
  if (!state.activeEvent) {
    return;
  }

  if (state.activeEvent.type === "portals") {
    const teleported = resolvePortalActivation(state.board, state.activeEvent);
    if (teleported) {
      queuePromotionIfEligible(state, teleported.piece, teleported.position);
    }
  }

  resolveBoardEventPostMove(state);
}

function decayCooldownsAndStatuses(state, color) {
  for (const type of PIECE_TYPES) {
    state.cooldowns[color][type] = Math.max(0, state.cooldowns[color][type] - 1);
  }

  for (const row of state.board) {
    for (const piece of row) {
      if (!piece || piece.color !== color) {
        continue;
      }
      if (piece.status.stunned > 0) {
        piece.status.stunned -= 1;
      }
      if (piece.status.frozen > 0) {
        piece.status.frozen -= 1;
      }
    }
  }
}

function finishTurn(state, action) {
  state.lastAction = action;
  state.moveHistory.push(action.description);
  state.drawOfferBy = null;
  state.abilityUsedThisTurn = false;
  state.rematchVotes = {
    white: false,
    black: false,
  };
  resolveBoardEventPostMove(state);
  if (state.winner) {
    if (!state.endReason) {
      state.endReason = "capture";
    }
    state.gameEndedAt = state.gameEndedAt || Date.now();
    return state;
  }

  decayCooldownsAndStatuses(state, state.currentTurn);
  state.turnCount += 1;

  if (state.activeEvent) {
    state.activeEvent.turnsRemaining -= 1;
    if (state.activeEvent.turnsRemaining <= 0) {
      state.activeEvent = null;
    }
  }

  if (!state.activeEvent && state.turnCount > 0 && state.turnCount % 10 === 0) {
    state.activeEvent = createRandomEvent(state.board);
    state.activeEvent.startedOnTurn = state.turnCount;
    activateEventImmediately(state);
  }

  state.currentTurn = otherColor(state.currentTurn);
  state.turnStartedAt = Date.now();
  return state;
}

function addSlideMoves(moves, state, piece, position, directions) {
  for (const [dx, dy] of directions) {
    let x = position.x + dx;
    let y = position.y + dy;
    while (inBounds(x, y)) {
      const target = getPieceAt(state.board, { x, y });
      if (!target) {
        moves.push({ x, y });
      } else {
        if (target.color !== piece.color) {
          moves.push({ x, y });
        }
        break;
      }
      x += dx;
      y += dy;
    }
  }
}

function getPortalExit(event, position) {
  if (!event || event.type !== "portals") {
    return null;
  }
  const first = event.tiles[0];
  const second = event.tiles[1];
  if (!first || !second) {
    return null;
  }
  if (first.x === position.x && first.y === position.y) {
    return second;
  }
  if (second.x === position.x && second.y === position.y) {
    return first;
  }
  return null;
}

function isFogRulesDisabled(state) {
  return state.activeEvent?.type === "fog";
}

function findKingPosition(board, color) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = board[y][x];
      if (piece?.type === "king" && piece.color === color) {
        return { x, y };
      }
    }
  }
  return null;
}

export function getPieceState(state, pieceId) {
  return findPiece(state.board, pieceId);
}

function getPseudoLegalMoves(state, pieceId) {
  if (state.winner || state.pendingPromotion || state.pendingAbility) {
    return [];
  }
  const lookup = findPiece(state.board, pieceId);
  if (!lookup) {
    return [];
  }

  const { piece, position } = lookup;
  if (piece.color !== state.currentTurn || piece.status.stunned > 0 || piece.status.frozen > 0) {
    return [];
  }

  const moves = [];

  if (piece.type === "pawn") {
    const direction = piece.color === "white" ? -1 : 1;
    const startRank = piece.color === "white" ? 6 : 1;
    const oneStep = { x: position.x, y: position.y + direction };
    const twoStep = { x: position.x, y: position.y + direction * 2 };

    if (inBounds(oneStep.x, oneStep.y) && !getPieceAt(state.board, oneStep)) {
      moves.push(oneStep);
      if (position.y === startRank && !getPieceAt(state.board, twoStep)) {
        moves.push(twoStep);
      }
    }

    for (const dx of [-1, 1]) {
      const target = { x: position.x + dx, y: position.y + direction };
      if (!inBounds(target.x, target.y)) {
        continue;
      }
      const occupant = getPieceAt(state.board, target);
      if (occupant && occupant.color !== piece.color) {
        moves.push(target);
      }
      if (
        state.enPassantTarget &&
        state.enPassantTarget.x === target.x &&
        state.enPassantTarget.y === target.y
      ) {
        moves.push(target);
      }
    }
  }

  if (piece.type === "knight") {
    for (const [dx, dy] of DIRECTIONS.knight) {
      const x = position.x + dx;
      const y = position.y + dy;
      if (!inBounds(x, y)) {
        continue;
      }
      const target = getPieceAt(state.board, { x, y });
      if (!target || target.color !== piece.color) {
        moves.push({ x, y });
      }
    }
  }

  if (piece.type === "bishop") {
    addSlideMoves(moves, state, piece, position, DIRECTIONS.bishop);
  }

  if (piece.type === "rook") {
    addSlideMoves(moves, state, piece, position, DIRECTIONS.rook);
  }

  if (piece.type === "queen") {
    addSlideMoves(moves, state, piece, position, [...DIRECTIONS.rook, ...DIRECTIONS.bishop]);
  }

  if (piece.type === "king") {
    for (const [dx, dy] of [...DIRECTIONS.rook, ...DIRECTIONS.bishop]) {
      const x = position.x + dx;
      const y = position.y + dy;
      if (!inBounds(x, y)) {
        continue;
      }
      const target = getPieceAt(state.board, { x, y });
      if (!target || target.color !== piece.color) {
        moves.push({ x, y });
      }
    }

    if (!piece.hasMoved) {
      for (const side of ["king", "queen"]) {
        const rookPosition = {
          x: side === "king" ? 7 : 0,
          y: position.y,
        };
        const rook = getPieceAt(state.board, rookPosition);
        if (!rook || rook.type !== "rook" || rook.color !== piece.color || rook.hasMoved) {
          continue;
        }
        const direction = side === "king" ? 1 : -1;
        const pathSquares = side === "king" ? [5, 6] : [1, 2, 3];
        const clear = pathSquares.every((x) => !getPieceAt(state.board, { x, y: position.y }));
        if (clear) {
          moves.push({ x: position.x + direction * 2, y: position.y, castle: side });
        }
      }
    }
  }

  return uniqueBy(moves, toSquareKey);
}

function getPseudoAbilityTargets(state, pieceId) {
  if (state.winner || state.pendingPromotion) {
    return [];
  }
  const lookup = findPiece(state.board, pieceId);
  if (!lookup) {
    return [];
  }
  const { piece, position } = lookup;
  if (
    (state.abilityUsedThisTurn && !state.pendingAbility) ||
    piece.color !== state.currentTurn ||
    piece.status.stunned > 0 ||
    piece.status.frozen > 0 ||
    (state.cooldowns[piece.color][piece.type] > 0 &&
      !(state.pendingAbility?.type === "knight" && state.pendingAbility.pieceId === pieceId))
  ) {
    return [];
  }

  if (
    state.pendingAbility &&
    !(state.pendingAbility.type === "knight" && state.pendingAbility.pieceId === pieceId)
  ) {
    return [];
  }

  if (piece.type === "pawn") {
    return [{ x: position.x, y: position.y, kind: "self" }];
  }

  if (piece.type === "king") {
    return listSquares()
      .map((square) => ({ square, occupant: getPieceAt(state.board, square) }))
      .filter(({ occupant }) => occupant && occupant.color !== piece.color)
      .map(({ square }) => ({ ...square, kind: "stun" }));
  }

  if (piece.type === "queen") {
    const targets = [];
    for (const square of listSquares()) {
      const occupant = getPieceAt(state.board, square);
      if (!occupant) {
        targets.push({ ...square, kind: "teleport" });
      } else if (occupant.color !== piece.color) {
        const legal = getLegalMoves(state, pieceId);
        if (legal.some((move) => move.x === square.x && move.y === square.y)) {
          targets.push({ ...square, kind: "capture" });
        }
      }
    }
    return targets;
  }

  if (piece.type === "rook") {
    const targets = [];
    for (const [dx, dy] of DIRECTIONS.rook) {
      const target = { x: position.x + dx, y: position.y + dy };
      const landing = { x: target.x + dx, y: target.y + dy };
      if (!inBounds(target.x, target.y) || !inBounds(landing.x, landing.y)) {
        continue;
      }
      const occupant = getPieceAt(state.board, target);
      const canPushThisAlly = occupant && occupant.color === piece.color;
      if (!canPushThisAlly || getPieceAt(state.board, landing)) {
        continue;
      }
      targets.push({ ...target, kind: "push", end: landing });
    }
    return targets;
  }

  if (piece.type === "bishop") {
    const targets = [];
    for (const [dx, dy] of DIRECTIONS.bishop) {
      let x = position.x + dx;
      let y = position.y + dy;
      let phased = false;
      while (inBounds(x, y)) {
        const target = getPieceAt(state.board, { x, y });
        if (!target) {
          if (phased) {
            targets.push({ x, y, kind: "phase" });
          }
        } else if (target.color === piece.color) {
          if (phased) {
            break;
          }
          phased = true;
        } else {
          if (phased) {
            targets.push({ x, y, kind: "phase" });
          }
          break;
        }
        x += dx;
        y += dy;
      }
    }
    return targets;
  }

  if (piece.type === "knight") {
    const jumps = [];
    for (const [dx, dy] of DIRECTIONS.knight) {
      const x = position.x + dx;
      const y = position.y + dy;
      if (!inBounds(x, y)) {
        continue;
      }
      const target = getPieceAt(state.board, { x, y });
      if (!target || target.color !== piece.color) {
        jumps.push({
          x,
          y,
          kind: state.pendingAbility?.type === "knight" ? "second-jump" : "first-jump",
        });
      }
    }
    return uniqueBy(jumps, toSquareKey);
  }

  return [];
}

function isSquareThreatenedByColor(state, square, attackerColor) {
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece || piece.color !== attackerColor || piece.status.stunned > 0 || piece.status.frozen > 0) {
        continue;
      }
      const pseudoState = { ...state, currentTurn: attackerColor };
      const moves = getPseudoLegalMoves(pseudoState, piece.id);
      if (moves.some((move) => move.x === square.x && move.y === square.y)) {
        return true;
      }
      const abilities = getPseudoAbilityTargets(pseudoState, piece.id);
      if (
        abilities.some((target) => {
          if (target.x !== square.x || target.y !== square.y) {
            return false;
          }
          if (piece.type === "bishop" || piece.type === "knight") {
            return true;
          }
          return piece.type === "queen" && target.kind === "capture";
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function isKingUnderThreat(state, color) {
  if (isFogRulesDisabled(state)) {
    return false;
  }
  const kingSquare = findKingPosition(state.board, color);
  if (!kingSquare) {
    return true;
  }
  return isSquareThreatenedByColor(state, kingSquare, otherColor(color));
}

function maybeTeleport(state, finalPosition) {
  const exit = getPortalExit(state.activeEvent, finalPosition);
  if (!exit || getPieceAt(state.board, exit)) {
    return finalPosition;
  }
  return exit;
}

function removePieceById(board, pieceId) {
  const lookup = findPiece(board, pieceId);
  if (!lookup) {
    return false;
  }
  setPieceAt(board, lookup.position, null);
  return true;
}

function capturePiece(state, position, attacker = null) {
  const target = getPieceAt(state.board, position);
  if (!target) {
    return;
  }

  setPieceAt(state.board, position, null);
  if (target.type === "king") {
    state.winner = attacker ? attacker.color : otherColor(target.color);
  }
}

function handleExplosiveCounter(state, attacker, destination) {
  const target = getPieceAt(state.board, destination);
  if (!target?.status.explosive) {
    return false;
  }
  setPieceAt(state.board, destination, null);
  removePieceById(state.board, attacker.id);
  return true;
}

function handleExplosiveCaptureAt(state, attacker, destination) {
  return handleExplosiveCounter(state, attacker, destination);
}

function executeMoveUnchecked(state, pieceId, targetPosition, promotionChoice = "queen") {
  const legalMoves = getPseudoLegalMoves(state, pieceId);
  const move = legalMoves.find((option) => option.x === targetPosition.x && option.y === targetPosition.y);
  if (!move) {
    return state;
  }

  const next = cloneState(state);
  const lookup = findPiece(next.board, pieceId);
  if (!lookup) {
    return state;
  }
  const { piece, position } = lookup;
  const previousEnPassant = next.enPassantTarget;
  next.enPassantTarget = null;

  if (piece.type === "pawn" && previousEnPassant?.x === move.x && previousEnPassant.y === move.y) {
    const capturedPawn = { x: move.x, y: position.y };
    if (handleExplosiveCaptureAt(next, piece, capturedPawn)) {
      return finishTurn(next, {
        type: "move",
        pieceId,
        description: `${piece.color} ${piece.type} exploded on en passant`,
      });
    }
    capturePiece(next, capturedPawn, piece);
  }

  const directTarget = getPieceAt(next.board, move);
  if (directTarget) {
    if (handleExplosiveCounter(next, piece, move)) {
      return finishTurn(next, {
        type: "move",
        pieceId,
        description: `${piece.color} ${piece.type} exploded on capture`,
      });
    }
    capturePiece(next, move, piece);
  }

  setPieceAt(next.board, position, null);
  const finalPosition = maybeTeleport(next, move);
  piece.hasMoved = true;
  if (piece.type === "pawn" && piece.status.explosive) {
    piece.status.explosive = false;
  }
  setPieceAt(next.board, finalPosition, piece);

  if (piece.type === "pawn" && Math.abs(finalPosition.y - position.y) === 2) {
    next.enPassantTarget = { x: position.x, y: (position.y + finalPosition.y) / 2 };
  }

  if (piece.type === "king" && Math.abs(finalPosition.x - position.x) === 2) {
    const rookFrom = { x: finalPosition.x > position.x ? 7 : 0, y: position.y };
    const rookTo = { x: finalPosition.x > position.x ? 5 : 3, y: position.y };
    const rook = getPieceAt(next.board, rookFrom);
    setPieceAt(next.board, rookFrom, null);
    if (rook) {
      rook.hasMoved = true;
    }
    setPieceAt(next.board, rookTo, rook);
  }

  if (piece.type === "pawn" && (finalPosition.y === 0 || finalPosition.y === 7)) {
    queuePromotionIfEligible(next, piece, finalPosition, promotionChoice);
    next.lastAction = {
      type: "move",
      pieceId,
      from: position,
      to: finalPosition,
      description: `${piece.color} pawn reached promotion`,
    };
    return next;
  }

  return finishTurn(next, {
    type: "move",
    pieceId,
    from: position,
    to: finalPosition,
    description: `${piece.color} ${piece.type} moved`,
  });
}

function canCurrentPlayerEscapeThreat(state) {
  if (isFogRulesDisabled(state) || !isKingUnderThreat(state, state.currentTurn)) {
    return true;
  }

  for (const row of state.board) {
    for (const piece of row) {
      if (!piece || piece.color !== state.currentTurn) {
        continue;
      }
      const moves = getLegalMoves(state, piece.id);
      if (moves.length > 0) {
        return true;
      }
      const abilities = getAbilityTargets(state, piece.id);
      if (abilities.length > 0) {
        return true;
      }
    }
  }
  return false;
}

function resolveCheckmateOrStalemate(state) {
  if (state.winner || isFogRulesDisabled(state)) {
    return state;
  }
  if (canCurrentPlayerEscapeThreat(state)) {
    return state;
  }
  if (isKingUnderThreat(state, state.currentTurn)) {
    state.winner = otherColor(state.currentTurn);
    state.endReason = "checkmate";
    state.gameEndedAt = state.gameEndedAt || Date.now();
    return state;
  }
  state.winner = "draw";
  state.endReason = "draw";
  state.gameEndedAt = state.gameEndedAt || Date.now();
  return state;
}

function wouldKingBeSafeAfterMove(state, pieceId, move) {
  if (isFogRulesDisabled(state)) {
    return true;
  }
  const pieceState = findPiece(state.board, pieceId);
  if (!pieceState) {
    return false;
  }
  if (
    pieceState.piece.type === "king" &&
    Math.abs(move.x - pieceState.position.x) === 2 &&
    isKingUnderThreat(state, pieceState.piece.color)
  ) {
    return false;
  }

  if (pieceState.piece.type === "king" && Math.abs(move.x - pieceState.position.x) === 2) {
    const direction = move.x > pieceState.position.x ? 1 : -1;
    const intermediate = { x: pieceState.position.x + direction, y: pieceState.position.y };
    const intermediateState = executeMoveUnchecked(state, pieceId, intermediate);
    if (intermediateState === state || isKingUnderThreat(intermediateState, pieceState.piece.color)) {
      return false;
    }
  }

  const next = executeMoveUnchecked(state, pieceId, move);
  if (next === state) {
    return false;
  }
  return !isKingUnderThreat(next, pieceState.piece.color);
}

export function getLegalMoves(state, pieceId) {
  const pseudoMoves = getPseudoLegalMoves(state, pieceId);
  if (isFogRulesDisabled(state)) {
    return pseudoMoves;
  }
  return pseudoMoves.filter((move) => {
    const occupant = getPieceAt(state.board, move);
    if (occupant?.type === "king" && occupant.color !== state.currentTurn) {
      return false;
    }
    return wouldKingBeSafeAfterMove(state, pieceId, move);
  });
}

export function applyMove(state, pieceId, targetPosition, promotionChoice = "queen") {
  const legalMoves = getLegalMoves(state, pieceId);
  const move = legalMoves.find((option) => option.x === targetPosition.x && option.y === targetPosition.y);
  if (!move) {
    return state;
  }
  const next = executeMoveUnchecked(state, pieceId, move, promotionChoice);
  if (next.pendingPromotion || next.currentTurn === state.currentTurn) {
    return next;
  }
  return resolveCheckmateOrStalemate(next);
}

export function resolvePromotion(state, choice) {
  if (!state.pendingPromotion) {
    return state;
  }

  const next = cloneState(state);
  const { position, pieceId, defaultChoice } = next.pendingPromotion;
  const piece = getPieceAt(next.board, position);
  if (!piece || piece.id !== pieceId) {
    return state;
  }
  piece.type = choice || defaultChoice || "queen";
  next.pendingPromotion = null;
  const promoted = finishTurn(next, {
    type: "promotion",
    pieceId,
    to: position,
    description: `${piece.color} pawn promoted to ${piece.type}`,
  });
  return resolveCheckmateOrStalemate(promoted);
}

export function cloneGameState(state) {
  return deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
}

export function resignGame(state, color) {
  if (!color || state.winner) {
    return state;
  }
  const next = cloneState(state);
  next.winner = otherColor(color);
  next.endReason = "resign";
  next.gameEndedAt = Date.now();
  next.drawOfferBy = null;
  next.rematchVotes = {
    white: false,
    black: false,
  };
  next.lastAction = {
    type: "resign",
    description: `${color} resigned`,
  };
  next.moveHistory.push(next.lastAction.description);
  return next;
}

export function offerOrAcceptDraw(state, color) {
  if (!color || state.winner) {
    return state;
  }
  const next = cloneState(state);

  if (next.drawOfferBy && next.drawOfferBy !== color) {
    next.winner = "draw";
    next.endReason = "draw";
    next.gameEndedAt = Date.now();
    next.lastAction = {
      type: "draw",
      description: "Draw agreed",
    };
    next.moveHistory.push(next.lastAction.description);
    next.drawOfferBy = null;
    next.rematchVotes = {
      white: false,
      black: false,
    };
    return next;
  }

  if (next.drawOfferBy === color) {
    return state;
  }

  next.drawOfferBy = color;
  next.lastAction = {
    type: "draw-offer",
    description: `${color} offered draw`,
  };
  next.moveHistory.push(next.lastAction.description);
  return next;
}

function executeAbilityUnchecked(state, pieceId, target) {
  const options = getPseudoAbilityTargets(state, pieceId);
  const choice = options.find((option) => option.x === target.x && option.y === target.y);
  if (!choice) {
    return state;
  }

  const next = cloneState(state);
  const lookup = findPiece(next.board, pieceId);
  if (!lookup) {
    return state;
  }
  const { piece, position } = lookup;

  next.cooldowns[piece.color][piece.type] = ABILITY_COOLDOWNS[piece.type];

  if (piece.type === "pawn") {
    piece.status.explosive = true;
    next.abilityUsedThisTurn = true;
    next.lastAction = {
      type: "ability",
      pieceId,
      from: position,
      to: position,
      description: `${piece.color} pawn armed itself`,
    };
    return next;
  }

  if (piece.type === "king") {
    const enemy = getPieceAt(next.board, target);
    if (enemy) {
      enemy.status.stunned = 1;
    }
    next.abilityUsedThisTurn = true;
    next.lastAction = {
      type: "ability",
      pieceId,
      from: position,
      description: `${piece.color} king stunned a piece`,
      to: target,
    };
    return next;
  }

  if (piece.type === "rook") {
    const ally = getPieceAt(next.board, target);
    setPieceAt(next.board, position, null);
    setPieceAt(next.board, target, null);
    if (ally) {
      ally.hasMoved = true;
    }
    setPieceAt(next.board, choice.end, ally);
    piece.hasMoved = true;
    setPieceAt(next.board, target, piece);
    if (ally && queuePromotionIfEligible(next, ally, choice.end)) {
      next.lastAction = {
        type: "ability",
        pieceId,
        from: position,
        to: choice.end,
        description: `${piece.color} rook pushed a pawn into promotion`,
      };
      return next;
    }
    return finishTurn(next, {
      type: "ability",
      pieceId,
      from: position,
      to: target,
      description: `${piece.color} rook repositioned an ally`,
    });
  }

  if (piece.type === "bishop") {
    const occupant = getPieceAt(next.board, target);
    if (occupant && handleExplosiveCounter(next, piece, target)) {
      return finishTurn(next, {
        type: "ability",
        pieceId,
        description: `${piece.color} bishop triggered an explosion`,
      });
    }
    if (occupant) {
      capturePiece(next, target, piece);
    }
    setPieceAt(next.board, position, null);
    const landing = maybeTeleport(next, target);
    piece.hasMoved = true;
    setPieceAt(next.board, landing, piece);
    return finishTurn(next, {
      type: "ability",
      pieceId,
      from: position,
      to: landing,
      description: `${piece.color} bishop phased`,
    });
  }

  if (piece.type === "queen") {
    const occupant = getPieceAt(next.board, target);
    if (occupant && handleExplosiveCounter(next, piece, target)) {
      return finishTurn(next, {
        type: "ability",
        pieceId,
        description: `${piece.color} queen triggered an explosion`,
      });
    }
    if (occupant) {
      capturePiece(next, target, piece);
    }
    setPieceAt(next.board, position, null);
    const landing = maybeTeleport(next, target);
    piece.hasMoved = true;
    setPieceAt(next.board, landing, piece);
    return finishTurn(next, {
      type: "ability",
      pieceId,
      from: position,
      to: landing,
      description: `${piece.color} queen warped`,
    });
  }

  if (piece.type === "knight") {
    setPieceAt(next.board, position, null);
    const jumpedTarget = getPieceAt(next.board, target);
    if (jumpedTarget) {
      if (handleExplosiveCounter(next, piece, target)) {
        return finishTurn(next, {
          type: "ability",
          pieceId,
          from: position,
          to: target,
          description: `${piece.color} knight exploded during its jump`,
        });
      }
      capturePiece(next, target, piece);
    }
    const landing = maybeTeleport(next, target);
    piece.hasMoved = true;
    setPieceAt(next.board, landing, piece);

    if (next.winner) {
      next.pendingAbility = null;
      return finishTurn(next, {
        type: "ability",
        pieceId,
        from: position,
        to: landing,
        description: `${piece.color} knight captured the king`,
      });
    }

    if (!state.pendingAbility) {
      next.pendingAbility = {
        type: "knight",
        pieceId,
      };
      next.lastAction = {
        type: "ability",
        pieceId,
        from: position,
        to: landing,
        description: `${piece.color} knight made its first jump`,
      };
      return next;
    }

    next.pendingAbility = null;
    return finishTurn(next, {
      type: "ability",
      pieceId,
      from: position,
      to: landing,
      description: `${piece.color} knight completed its double jump`,
    });
  }

  return state;
}

function canCurrentPlayerEventuallyEscape(state) {
  if (isFogRulesDisabled(state) || !isKingUnderThreat(state, state.currentTurn)) {
    return true;
  }

  if (state.pendingAbility?.type === "knight") {
    const secondJumpTargets = getPseudoAbilityTargets(state, state.pendingAbility.pieceId);
    return secondJumpTargets.some((target) => {
      const next = executeAbilityUnchecked(state, state.pendingAbility.pieceId, target);
      return next !== state && !isKingUnderThreat(next, state.currentTurn);
    });
  }

  for (const row of state.board) {
    for (const piece of row) {
      if (!piece || piece.color !== state.currentTurn) {
        continue;
      }
      if (getLegalMoves(state, piece.id).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function wouldKingBeSafeAfterAbility(state, pieceId, target) {
  if (isFogRulesDisabled(state)) {
    return true;
  }
  const pieceState = findPiece(state.board, pieceId);
  if (!pieceState) {
    return false;
  }
  const next = executeAbilityUnchecked(state, pieceId, target);
  if (next === state) {
    return false;
  }
  if (next.currentTurn !== state.currentTurn) {
    return !isKingUnderThreat(next, pieceState.piece.color);
  }
  return canCurrentPlayerEventuallyEscape(next);
}

export function getAbilityTargets(state, pieceId) {
  const pseudoTargets = getPseudoAbilityTargets(state, pieceId);
  if (isFogRulesDisabled(state)) {
    return pseudoTargets;
  }
  return pseudoTargets.filter((target) => {
    const occupant = getPieceAt(state.board, target);
    if (occupant?.type === "king" && occupant.color !== state.currentTurn) {
      return false;
    }
    return wouldKingBeSafeAfterAbility(state, pieceId, target);
  });
}

export function applyAbility(state, pieceId, target) {
  const options = getAbilityTargets(state, pieceId);
  const choice = options.find((option) => option.x === target.x && option.y === target.y);
  if (!choice) {
    return state;
  }
  const next = executeAbilityUnchecked(state, pieceId, choice);
  if (next === state || next.currentTurn === state.currentTurn) {
    return next;
  }
  return resolveCheckmateOrStalemate(next);
}

export function getVisibleSquares(state, color) {
  if (state.activeEvent?.type !== "fog") {
    return new Set(listSquares().map(toSquareKey));
  }

  const visible = new Set();
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = state.board[y][x];
      if (!piece || piece.color !== color) {
        continue;
      }
      visible.add(toSquareKey({ x, y }));
      for (const move of getLegalMoves({ ...state, currentTurn: color }, piece.id)) {
        visible.add(toSquareKey(move));
      }
    }
  }
  return visible;
}

export function canUseAbility(state, pieceId) {
  return getAbilityTargets(state, pieceId).length > 0;
}

export function resetState() {
  return createInitialState();
}

export function getEventSummary(event) {
  if (!event) {
    return "No active event";
  }
  return `${EVENT_TYPES[event.type]} (${event.turnsRemaining} turn${event.turnsRemaining === 1 ? "" : "s"} left)`;
}

export function getEventAnnouncement(event) {
  if (!event) {
    return null;
  }

  const announcements = {
    lava: {
      title: "EVENT STARTED: FLOOR IS LAVA!",
      description: "Lava tiles immediately destroy pieces standing on them.",
    },
    portals: {
      title: "EVENT STARTED: PORTALS OPEN!",
      description: "Stepping onto a portal instantly teleports a piece to the linked tile.",
    },
    fog: {
      title: "EVENT STARTED: FOG OF WAR!",
      description: "You can only see your pieces and the squares they can legally move to.",
    },
    restore: {
      title: "EVENT STARTED: RESTORE TILES!",
      description: "Standing on a restore tile immediately resets that piece type's cooldown.",
    },
  };

  return announcements[event.type] || null;
}


export function serializeState(state) {
  const plain = JSON.parse(JSON.stringify(state));
  return {
    ...plain,
    board: plain.board.flat(),
  };
}

export function deserializeState(state) {
  if (!state) {
    return state;
  }

  const board = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    board.push(state.board.slice(row * BOARD_SIZE, (row + 1) * BOARD_SIZE));
  }

  return {
    ...state,
    board,
  };
}

export function squareFromKey(key) {
  return fromSquareKey(key);
}

export function voteForRematch(state, color) {
  if (!state.winner || !color) {
    return state;
  }

  const next = cloneState(state);
  next.rematchVotes = {
    white: Boolean(next.rematchVotes?.white),
    black: Boolean(next.rematchVotes?.black),
  };

  if (next.rematchVotes[color]) {
    return state;
  }

  next.rematchVotes[color] = true;
  next.lastAction = {
    type: "rematch-vote",
    description: `${color} voted for rematch`,
  };

  if (next.rematchVotes.white && next.rematchVotes.black) {
    return createInitialState();
  }

  return next;
}
