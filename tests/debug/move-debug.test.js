
// Move Debug Test
// Diagnose first move rejection issue

import { describe, it, expect } from 'vitest';

// Copy the getValidMoves logic from backend for testing
function getZuMoves(row, col, piece, board) {
  const moves = [];
  const forward = piece.color === 'red' ? -1 : 1;
  const crossedRiver = piece.color === 'red' ? row <= 4 : row >= 5;
  
  // Forward move
  const newRow = row + forward;
  if (newRow >= 0 && newRow <= 9) {
    const target = board[newRow][col];
    if (!target || target.color !== piece.color) {
      moves.push({ row: newRow, col: col });
    }
  }
  
  // Sideways moves after crossing river
  if (crossedRiver) {
    for (const dc of [-1, 1]) {
      const newCol = col + dc;
      if (newCol >= 0 && newCol <= 8) {
        const target = board[row][newCol];
        if (!target || target.color !== piece.color) {
          moves.push({ row: row, col: newCol });
        }
      }
    }
  }
  
  return moves;
}

function getJuMoves(row, col, piece, board) {
  const moves = [];
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  
  for (const [dr, dc] of directions) {
    let newRow = row + dr;
    let newCol = col + dc;
    
    while (newRow >= 0 && newRow <= 9 && newCol >= 0 && newCol <= 8) {
      const target = board[newRow][newCol];
      if (!target) {
        moves.push({ row: newRow, col: newCol });
      } else {
        if (target.color !== piece.color) {
          moves.push({ row: newRow, col: newCol });
        }
        break;
      }
      newRow += dr;
      newCol += dc;
    }
  }
  
  return moves;
}

function initializeBoard() {
  const board = Array(10).fill(null).map(() => Array(9).fill(null));
  
  // Black pieces (top)
  board[0][0] = { type: 'ju', color: 'black', name: '車' };
  board[0][1] = { type: 'ma', color: 'black', name: '馬' };
  board[0][2] = { type: 'xiang', color: 'black', name: '象' };
  board[0][3] = { type: 'shi', color: 'black', name: '士' };
  board[0][4] = { type: 'jiang', color: 'black', name: '將' };
  board[0][5] = { type: 'shi', color: 'black', name: '士' };
  board[0][6] = { type: 'xiang', color: 'black', name: '象' };
  board[0][7] = { type: 'ma', color: 'black', name: '馬' };
  board[0][8] = { type: 'ju', color: 'black', name: '車' };
  board[2][1] = { type: 'pao', color: 'black', name: '砲' };
  board[2][7] = { type: 'pao', color: 'black', name: '砲' };
  board[3][0] = { type: 'zu', color: 'black', name: '卒' };
  board[3][2] = { type: 'zu', color: 'black', name: '卒' };
  board[3][4] = { type: 'zu', color: 'black', name: '卒' };
  board[3][6] = { type: 'zu', color: 'black', name: '卒' };
  board[3][8] = { type: 'zu', color: 'black', name: '卒' };

  // Red pieces (bottom)
  board[9][0] = { type: 'ju', color: 'red', name: '車' };
  board[9][1] = { type: 'ma', color: 'red', name: '馬' };
  board[9][2] = { type: 'xiang', color: 'red', name: '相' };
  board[9][3] = { type: 'shi', color: 'red', name: '仕' };
  board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
  board[9][5] = { type: 'shi', color: 'red', name: '仕' };
  board[9][6] = { type: 'xiang', color: 'red', name: '相' };
  board[9][7] = { type: 'ma', color: 'red', name: '馬' };
  board[9][8] = { type: 'ju', color: 'red', name: '車' };
  board[7][1] = { type: 'pao', color: 'red', name: '炮' };
  board[7][7] = { type: 'pao', color: 'red', name: '炮' };
  board[6][0] = { type: 'zu', color: 'red', name: '兵' };
  board[6][2] = { type: 'zu', color: 'red', name: '兵' };
  board[6][4] = { type: 'zu', color: 'red', name: '兵' };
  board[6][6] = { type: 'zu', color: 'red', name: '兵' };
  board[6][8] = { type: 'zu', color: 'red', name: '兵' };

  return board;
}

describe('Move Debug Tests', () => {
  describe('Initial Board State', () => {
    it('should initialize board correctly', () => {
      const board = initializeBoard();
      
      // Check red pawn at row 6, col 0
      expect(board[6][0]).toEqual({ type: 'zu', color: 'red', name: '兵' });
      
      // Check red chariot at row 9, col 0
      expect(board[9][0]).toEqual({ type: 'ju', color: 'red', name: '車' });
      
      // Check black pieces
      expect(board[0][0]).toEqual({ type: 'ju', color: 'black', name: '車' });
    });
    
    it('should have correct board dimensions', () => {
      const board = initializeBoard();
      expect(board.length).toBe(10);
      expect(board[0].length).toBe(9);
    });
  });
  
  describe('Red Pawn Initial Moves', () => {
    it('should allow red pawn to move forward one step', () => {
      const board = initializeBoard();
      const pawn = board[6][0]; // Red pawn at row 6, col 0
      
      expect(pawn).not.toBeNull();
      expect(pawn.color).toBe('red');
      expect(pawn.type).toBe('zu');
      
      const validMoves = getZuMoves(6, 0, pawn, board);
      
      // Red pawn should be able to move forward (row - 1)
      expect(validMoves).toContainEqual({ row: 5, col: 0 });
    });
    
    it('should allow all red pawns to move forward', () => {
      const board = initializeBoard();
      
      // Test all red pawns at row 6
      const pawnCols = [0, 2, 4, 6, 8];
      
      for (const col of pawnCols) {
        const pawn = board[6][col];
        expect(pawn).not.toBeNull();
        expect(pawn.color).toBe('red');
        
        const validMoves = getZuMoves(6, col, pawn, board);
        
        // Should be able to move forward
        expect(validMoves.length).toBeGreaterThan(0);
        expect(validMoves).toContainEqual({ row: 5, col: col });
      }
    });
  });
  
  describe('Red Chariot Initial Moves', () => {
    it('should allow red chariot to move along edges', () => {
      const board = initializeBoard();
      const chariot = board[9][0]; // Red chariot at row 9, col 0
      
      expect(chariot).not.toBeNull();
      expect(chariot.color).toBe('red');
      expect(chariot.type).toBe('ju');
      
      const validMoves = getJuMoves(9, 0, chariot, board);
      
      // Chariot should be able to move up along the left edge
      expect(validMoves.length).toBeGreaterThan(0);
      
      // Should be able to move to row 8 (one step up)
      expect(validMoves).toContainEqual({ row: 8, col: 0 });
    });
    
    it('should allow red chariot at right edge to move', () => {
      const board = initializeBoard();
      const chariot = board[9][8]; // Red chariot at row 9, col 8
      
      expect(chariot).not.toBeNull();
      expect(chariot.color).toBe('red');
      
      const validMoves = getJuMoves(9, 8, chariot, board);
      
      expect(validMoves.length).toBeGreaterThan(0);
      expect(validMoves).toContainEqual({ row: 8, col: 8 });
    });
  });
  
  describe('Board Serialization', () => {
    it('should serialize and deserialize board correctly', () => {
      const board = initializeBoard();
      const serialized = JSON.stringify(board);
      const deserialized = JSON.parse(serialized);
      
      // Check a few positions
      expect(deserialized[6][0]).toEqual({ type: 'zu', color: 'red', name: '兵' });
      expect(deserialized[9][0]).toEqual({ type: 'ju', color: 'red', name: '車' });
      expect(deserialized[0][0]).toEqual({ type: 'ju', color: 'black', name: '車' });
      
      // Verify move calculation works on deserialized board
      const pawn = deserialized[6][0];
      const validMoves = getZuMoves(6, 0, pawn, deserialized);
      expect(validMoves).toContainEqual({ row: 5, col: 0 });
    });
  });
  
  describe('Move Validation Simulation', () => {
    it('should validate red pawn first move from (6,0) to (5,0)', () => {
      const board = initializeBoard();
      const fromRow = 6, fromCol = 0;
      const toRow = 5, toCol = 0;
      
      const piece = board[fromRow][fromCol];
      expect(piece).not.toBeNull();
      expect(piece.color).toBe('red');
      
      const validMoves = getZuMoves(fromRow, fromCol, piece, board);
      const isValid = validMoves.some(m => m.row === toRow && m.col === toCol);
      
      expect(isValid).toBe(true);
    });
    
    it('should validate red chariot first move from (9,0) to (8,0)', () => {
      const board = initializeBoard();
      const fromRow = 9, fromCol = 0;
      const toRow = 8, toCol = 0;
      
      const piece = board[fromRow][fromCol];
      expect(piece).not.toBeNull();
      expect(piece.color).toBe('red');
      
      const validMoves = getJuMoves(fromRow, fromCol, piece, board);
      const isValid = validMoves.some(m => m.row === toRow && m.col === toCol);
      
      expect(isValid).toBe(true);
    });
  });
});
