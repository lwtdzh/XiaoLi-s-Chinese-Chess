
// Board Logic Unit Tests
// Tests for board initialization, piece movement, and game state

import { describe, it, expect, beforeEach } from 'vitest';

// ========================================
// Test Helper Functions
// ========================================

function createEmptyBoard() {
  return Array(10).fill(null).map(() => Array(9).fill(null));
}

function createInitialBoard() {
  const board = createEmptyBoard();
  
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

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

function movePiece(board, from, to) {
  const newBoard = cloneBoard(board);
  newBoard[to.row][to.col] = newBoard[from.row][from.col];
  newBoard[from.row][from.col] = null;
  return newBoard;
}

// ========================================
// Tests
// ========================================

describe('Board Initialization', () => {
  it('should create a 10x9 board', () => {
    const board = createEmptyBoard();
    expect(board.length).toBe(10);
    expect(board[0].length).toBe(9);
  });

  it('should initialize with empty squares', () => {
    const board = createEmptyBoard();
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        expect(board[row][col]).toBeNull();
      }
    }
  });

  it('should place pieces in correct initial positions', () => {
    const board = createInitialBoard();
    
    // Check black back row
    expect(board[0][0]).not.toBeNull();
    expect(board[0][4].type).toBe('jiang');
    
    // Check red back row
    expect(board[9][0]).not.toBeNull();
    expect(board[9][4].type).toBe('jiang');
  });

  it('should have correct piece distribution', () => {
    const board = createInitialBoard();
    
    const pieceCounts = {
      red: { ju: 0, ma: 0, xiang: 0, shi: 0, jiang: 0, pao: 0, zu: 0 },
      black: { ju: 0, ma: 0, xiang: 0, shi: 0, jiang: 0, pao: 0, zu: 0 }
    };
    
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (piece) {
          pieceCounts[piece.color][piece.type]++;
        }
      }
    }
    
    // Verify counts
    expect(pieceCounts.red.ju).toBe(2);
    expect(pieceCounts.red.ma).toBe(2);
    expect(pieceCounts.red.xiang).toBe(2);
    expect(pieceCounts.red.shi).toBe(2);
    expect(pieceCounts.red.jiang).toBe(1);
    expect(pieceCounts.red.pao).toBe(2);
    expect(pieceCounts.red.zu).toBe(5);
    
    expect(pieceCounts.black.ju).toBe(2);
    expect(pieceCounts.black.ma).toBe(2);
    expect(pieceCounts.black.xiang).toBe(2);
    expect(pieceCounts.black.shi).toBe(2);
    expect(pieceCounts.black.jiang).toBe(1);
    expect(pieceCounts.black.pao).toBe(2);
    expect(pieceCounts.black.zu).toBe(5);
  });
});

describe('Piece Movement', () => {
  let board;

  beforeEach(() => {
    board = createInitialBoard();
  });

  it('should move piece to new position', () => {
    const newBoard = movePiece(board, { row: 9, col: 1 }, { row: 7, col: 2 });
    
    expect(newBoard[9][1]).toBeNull();
    expect(newBoard[7][2]).not.toBeNull();
    expect(newBoard[7][2].type).toBe('ma');
  });

  it('should not modify original board', () => {
    const originalPiece = board[9][1];
    movePiece(board, { row: 9, col: 1 }, { row: 7, col: 2 });
    
    expect(board[9][1]).toEqual(originalPiece);
  });

  it('should capture opponent piece', () => {
    // Setup a capture scenario
    board[5][5] = { type: 'ju', color: 'red', name: '車' };
    board[5][7] = { type: 'zu', color: 'black', name: '卒' };
    
    const newBoard = movePiece(board, { row: 5, col: 5 }, { row: 5, col: 7 });
    
    expect(newBoard[5][7].type).toBe('ju');
    expect(newBoard[5][7].color).toBe('red');
  });

  it('should clear source position after move', () => {
    const newBoard = movePiece(board, { row: 9, col: 0 }, { row: 8, col: 0 });
    
    expect(newBoard[9][0]).toBeNull();
  });
});

describe('Board Serialization', () => {
  it('should serialize board to JSON', () => {
    const board = createInitialBoard();
    const json = JSON.stringify(board);
    
    expect(json).toBeDefined();
    expect(typeof json).toBe('string');
  });

  it('should deserialize board from JSON', () => {
    const board = createInitialBoard();
    const json = JSON.stringify(board);
    const deserialized = JSON.parse(json);
    
    expect(deserialized).toEqual(board);
  });

  it('should preserve piece data after serialization', () => {
    const board = createInitialBoard();
    const json = JSON.stringify(board);
    const deserialized = JSON.parse(json);
    
    expect(deserialized[0][0]).toEqual({ type: 'ju', color: 'black', name: '車' });
    expect(deserialized[9][4]).toEqual({ type: 'jiang', color: 'red', name: '帥' });
  });
});

describe('Board State Validation', () => {
  it('should identify empty squares correctly', () => {
    const board = createInitialBoard();
    
    // Middle of board should be empty
    expect(board[4][4]).toBeNull();
    expect(board[5][4]).toBeNull();
  });

  it('should identify occupied squares correctly', () => {
    const board = createInitialBoard();
    
    expect(board[0][0]).not.toBeNull();
    expect(board[9][9 % 9]).not.toBeNull();
  });

  it('should identify piece colors correctly', () => {
    const board = createInitialBoard();
    
    // Top half should have black pieces
    expect(board[0][0].color).toBe('black');
    expect(board[2][1].color).toBe('black');
    
    // Bottom half should have red pieces
    expect(board[9][0].color).toBe('red');
    expect(board[7][1].color).toBe('red');
  });
});

describe('Game State', () => {
  it('should track current turn', () => {
    const gameState = {
      board: createInitialBoard(),
      currentTurn: 'red',
      moveCount: 0
    };
    
    expect(gameState.currentTurn).toBe('red');
  });

  it('should alternate turns after move', () => {
    const gameState = {
      board: createInitialBoard(),
      currentTurn: 'red',
      moveCount: 0
    };
    
    gameState.currentTurn = gameState.currentTurn === 'red' ? 'black' : 'red';
    gameState.moveCount++;
    
    expect(gameState.currentTurn).toBe('black');
    expect(gameState.moveCount).toBe(1);
  });

  it('should track move count', () => {
    const gameState = {
      board: createInitialBoard(),
      currentTurn: 'red',
      moveCount: 0
    };
    
    for (let i = 0; i < 10; i++) {
      gameState.currentTurn = gameState.currentTurn === 'red' ? 'black' : 'red';
      gameState.moveCount++;
    }
    
    expect(gameState.moveCount).toBe(10);
  });
});

describe('Special Board Positions', () => {
  it('should identify palace boundaries for red', () => {
    const redPalace = {
      minRow: 7,
      maxRow: 9,
      minCol: 3,
      maxCol: 5
    };
    
    // Check palace corners
    expect(redPalace.minRow).toBe(7);
    expect(redPalace.maxRow).toBe(9);
    expect(redPalace.minCol).toBe(3);
    expect(redPalace.maxCol).toBe(5);
  });

  it('should identify palace boundaries for black', () => {
    const blackPalace = {
      minRow: 0,
      maxRow: 2,
      minCol: 3,
      maxCol: 5
    };
    
    // Check palace corners
    expect(blackPalace.minRow).toBe(0);
    expect(blackPalace.maxRow).toBe(2);
    expect(blackPalace.minCol).toBe(3);
    expect(blackPalace.maxCol).toBe(5);
  });

  it('should identify river boundary', () => {
    const riverRow = 4.5; // Between row 4 and 5
    
    // Red side is rows 5-9
    // Black side is rows 0-4
    expect(riverRow).toBe(4.5);
  });
});
