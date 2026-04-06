import { BOARD_SIZE, FILES } from "./constants";

export function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function toSquareKey(position) {
  return `${position.x},${position.y}`;
}

export function fromSquareKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? structuredClone(piece) : null)));
}

export function algebraic(position) {
  return `${FILES[position.x]}${BOARD_SIZE - position.y}`;
}

export function getPieceAt(board, position) {
  if (!inBounds(position.x, position.y)) {
    return null;
  }
  return board[position.y][position.x];
}

export function setPieceAt(board, position, piece) {
  board[position.y][position.x] = piece;
}

export function findPiece(board, pieceId) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (board[y][x]?.id === pieceId) {
        return { piece: board[y][x], position: { x, y } };
      }
    }
  }
  return null;
}

export function otherColor(color) {
  return color === "white" ? "black" : "white";
}

export function makeEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

export function shuffle(array, rng = Math.random) {
  const next = [...array];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
