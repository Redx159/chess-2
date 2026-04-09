import whiteKing from "../../assets/white_king.png";
import whiteQueen from "../../assets/white_queen.png";
import whiteRook from "../../assets/white_rook.png";
import whiteBishop from "../../assets/white_bishop.png";
import whiteKnight from "../../assets/white_knight.png";
import whitePawn from "../../assets/white_pawn.png";
import blackKing from "../../assets/black_king.png";
import blackQueen from "../../assets/black_queen.png";
import blackRook from "../../assets/black_rook.png";
import blackBishop from "../../assets/black_bishop.png";
import blackKnight from "../../assets/black_knight.png";
import blackPawn from "../../assets/black_pawn.png";
import pawnAbility from "../../assets/pawn_ability.png";
import rookAbility from "../../assets/rook_png.png";
import knightAbility from "../../assets/knight_ability.png";
import bishopAbility from "../../assets/bishop_abillity.png";
import queenAbility from "../../assets/queen_ability.png";
import kingAbility from "../../assets/king_ability.png";

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

export const PIECE_IMAGE_ASSETS = {
  white: {
    king: whiteKing,
    queen: whiteQueen,
    rook: whiteRook,
    bishop: whiteBishop,
    knight: whiteKnight,
    pawn: whitePawn,
  },
  black: {
    king: blackKing,
    queen: blackQueen,
    rook: blackRook,
    bishop: blackBishop,
    knight: blackKnight,
    pawn: blackPawn,
  },
};

export const ABILITY_IMAGE_ASSETS = {
  pawn: pawnAbility,
  rook: rookAbility,
  knight: knightAbility,
  bishop: bishopAbility,
  queen: queenAbility,
  king: kingAbility,
};

export const ABILITY_COOLDOWNS = {
  pawn: 2,
  knight: 5,
  bishop: 4,
  rook: 3,
  queen: 7,
  king: 6,
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
