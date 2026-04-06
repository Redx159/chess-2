export const BOARD_SIZE = 8;

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export const PIECE_TYPES = ["pawn", "rook", "knight", "bishop", "queen", "king"];

export const PIECE_LABELS = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

export const ABILITY_COOLDOWNS = {
  pawn: 2,
  knight: 3,
  bishop: 3,
  rook: 4,
  queen: 5,
  king: 5,
};

export const ABILITY_DESCRIPTIONS = {
  pawn: "Arm this pawn. It cannot move on its next turn and destroys its captor if captured while armed.",
  knight: "Make two consecutive knight moves in one turn.",
  bishop: "Move diagonally while phasing through one allied piece.",
  rook: "Push an adjacent allied piece one tile and move the rook into that piece's previous square.",
  queen: "Teleport to any empty square, or capture only along a normal queen line.",
  king: "Stun any enemy piece for its next turn.",
};

export const EVENT_TYPES = {
  lava: "Lava Tiles",
  portals: "Portals",
  fog: "Fog of War",
  restore: "Restore Tiles",
};

export const DIRECTIONS = {
  rook: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  bishop: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  knight: [
    [1, 2],
    [2, 1],
    [-1, 2],
    [-2, 1],
    [1, -2],
    [2, -1],
    [-1, -2],
    [-2, -1],
  ],
};
