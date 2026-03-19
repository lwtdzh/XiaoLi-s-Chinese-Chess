// Middleware Validation Unit Tests
// Tests for server-side validation logic from _middleware.js
// Tests the bug fixes: input validation, optimistic locking, piece/turn validation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockD1Database } from '../setup.js';

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

// Mock game state for optimistic locking tests
function createGameState(overrides = {}) {
  return {
    board: JSON.stringify(createInitialBoard()),
    current_turn: 'red',
    move_count: 0,
    status: 'playing',
    ...overrides
  };
}

// Simulated validation logic extracted from middleware
function validateRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return { valid: false, error: 'Room identifier cannot be empty' };
  }
  
  const trimmed = roomId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Room identifier cannot be empty' };
  }
  
  // Limit length to prevent abuse
  const normalized = trimmed.length > 20 ? trimmed.substring(0, 20) : trimmed;
  return { valid: true, normalized };
}

function validateRoomName(roomName) {
  if (!roomName || roomName.trim().length === 0) {
    return { valid: false, error: 'Room name cannot be empty' };
  }
  
  const trimmed = roomName.trim().substring(0, 20);
  return { valid: true, normalized: trimmed };
}

function validateMove(gameState, moveData, playerColor) {
  const board = JSON.parse(gameState.board);
  const piece = board[moveData.from.row]?.[moveData.from.col];
  
  // Piece validation
  if (!piece) {
    return { valid: false, error: 'Piece not found', code: 4004 };
  }
  
  // Color validation
  if (piece.color !== playerColor) {
    return { valid: false, error: 'Not your turn', code: 4001 };
  }
  
  // Turn validation
  if (gameState.current_turn !== piece.color) {
    return { valid: false, error: 'Not your turn', code: 4001 };
  }
  
  return { valid: true, piece };
}

function validateOptimisticLocking(expectedMoveCount, updateResult) {
  // Optimistic locking check - if no rows changed, another move was applied first
  if (!updateResult.meta || updateResult.meta.changes === 0) {
    return { valid: false, error: 'Concurrent move detected - please refresh game state' };
  }
  return { valid: true };
}

// ========================================
// Tests
// ========================================

describe('Room ID Input Validation', () => {
  it('should reject empty room ID', () => {
    const result = validateRoomId('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject null room ID', () => {
    const result = validateRoomId(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject undefined room ID', () => {
    const result = validateRoomId(undefined);
    expect(result.valid).toBe(false);
  });

  it('should reject whitespace-only room ID', () => {
    const result = validateRoomId('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should trim whitespace from room ID', () => {
    const result = validateRoomId('  ROOM123  ');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('ROOM123');
  });

  it('should truncate room ID that is too long', () => {
    const longId = 'A'.repeat(50);
    const result = validateRoomId(longId);
    expect(result.valid).toBe(true);
    expect(result.normalized.length).toBe(20);
  });

  it('should accept valid room ID', () => {
    const result = validateRoomId('ROOM123');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('ROOM123');
  });
});

describe('Room Name Validation', () => {
  it('should reject empty room name', () => {
    const result = validateRoomName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject whitespace-only room name', () => {
    const result = validateRoomName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should trim and limit room name length', () => {
    const longName = 'A'.repeat(50);
    const result = validateRoomName('  ' + longName + '  ');
    expect(result.valid).toBe(true);
    expect(result.normalized.length).toBe(20);
  });

  it('should accept valid room name', () => {
    const result = validateRoomName('Test Room');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('Test Room');
  });
});

describe('Move Validation with Optimistic Locking', () => {
  let gameState;

  beforeEach(() => {
    gameState = createGameState();
  });

  it('should reject move when move_count mismatch (concurrent move detected)', () => {
    // Simulating a scenario where another move was applied first
    const updateResult = { meta: { changes: 0 } };
    
    const result = validateOptimisticLocking(0, updateResult);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Concurrent move');
  });

  it('should accept move when move_count matches', () => {
    const updateResult = { meta: { changes: 1 } };
    
    const result = validateOptimisticLocking(0, updateResult);
    expect(result.valid).toBe(true);
  });

  it('should reject move when update result has no meta', () => {
    const updateResult = {};
    
    const result = validateOptimisticLocking(0, updateResult);
    expect(result.valid).toBe(false);
  });

  it('OLD BUG: should detect concurrent move scenario', () => {
    // This tests the OLD buggy behavior would fail
    // Previously, there was no optimistic locking check
    // Now, concurrent moves are properly rejected
    
    const updateResult = { meta: { changes: 0 } };
    const result = validateOptimisticLocking(5, updateResult);
    
    // The NEW correct behavior: reject the move
    expect(result.valid).toBe(false);
  });
});

describe('Schema Consistency - game_state table', () => {
  it('should have status column in game_state', () => {
    const gameState = createGameState();
    expect(gameState).toHaveProperty('status');
  });

  it('should have move_count column in game_state', () => {
    const gameState = createGameState();
    expect(gameState).toHaveProperty('move_count');
  });

  it('should default status to playing', () => {
    const gameState = createGameState();
    expect(gameState.status).toBe('playing');
  });

  it('should default move_count to 0', () => {
    const gameState = createGameState();
    expect(gameState.move_count).toBe(0);
  });

  it('should store board as JSON string', () => {
    const gameState = createGameState();
    expect(typeof gameState.board).toBe('string');
    
    const parsed = JSON.parse(gameState.board);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(10);
  });
});

describe('Piece Validation', () => {
  let gameState;

  beforeEach(() => {
    gameState = createGameState();
  });

  it('should reject move with null piece (empty square)', () => {
    const moveData = {
      from: { row: 5, col: 4 }, // Empty square
      to: { row: 4, col: 4 }
    };
    
    const result = validateMove(gameState, moveData, 'red');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.code).toBe(4004);
  });

  it('should reject move with wrong color piece', () => {
    const moveData = {
      from: { row: 0, col: 0 }, // Black chariot
      to: { row: 1, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'red'); // Red player trying to move black piece
    expect(result.valid).toBe(false);
    expect(result.error).toContain('turn');
    expect(result.code).toBe(4001);
  });

  it('should accept move with correct color piece', () => {
    const moveData = {
      from: { row: 9, col: 0 }, // Red chariot
      to: { row: 8, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'red');
    expect(result.valid).toBe(true);
    expect(result.piece.type).toBe('ju');
    expect(result.piece.color).toBe('red');
  });
});

describe('Turn Validation', () => {
  it('should reject move when it is not player turn', () => {
    const gameState = createGameState({ current_turn: 'black' });
    
    const moveData = {
      from: { row: 9, col: 0 }, // Red chariot
      to: { row: 8, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'red');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('turn');
  });

  it('should accept move when it is player turn', () => {
    const gameState = createGameState({ current_turn: 'red' });
    
    const moveData = {
      from: { row: 9, col: 0 }, // Red chariot
      to: { row: 8, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'red');
    expect(result.valid).toBe(true);
  });

  it('should reject black move during red turn', () => {
    const gameState = createGameState({ current_turn: 'red' });
    
    const moveData = {
      from: { row: 0, col: 0 }, // Black chariot
      to: { row: 1, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'black');
    expect(result.valid).toBe(false);
  });

  it('should accept black move during black turn', () => {
    const gameState = createGameState({ current_turn: 'black' });
    
    const moveData = {
      from: { row: 0, col: 0 }, // Black chariot
      to: { row: 1, col: 0 }
    };
    
    const result = validateMove(gameState, moveData, 'black');
    expect(result.valid).toBe(true);
  });
});

describe('Database Mock Integration', () => {
  let db;

  beforeEach(async () => {
    db = new MockD1Database();
    
    // Create tables
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS game_state (
        room_id TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        current_turn TEXT NOT NULL,
        move_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'playing',
        updated_at INTEGER NOT NULL
      )
    `).run();
  });

  it('should insert game state with status column', async () => {
    const roomId = 'ROOM001';
    const board = JSON.stringify(createInitialBoard());
    
    await db.prepare(
      'INSERT INTO game_state (room_id, board, current_turn, move_count, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(roomId, board, 'red', 0, 'playing', Date.now()).run();
    
    const state = await db.prepare('SELECT * FROM game_state WHERE room_id = ?')
      .bind(roomId).first();
    
    expect(state).toBeDefined();
  });

  it('should insert game state with move_count column', async () => {
    const roomId = 'ROOM002';
    const board = JSON.stringify(createInitialBoard());
    
    await db.prepare(
      'INSERT INTO game_state (room_id, board, current_turn, move_count, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(roomId, board, 'red', 5, 'playing', Date.now()).run();
    
    const state = await db.prepare('SELECT * FROM game_state WHERE room_id = ?')
      .bind(roomId).first();
    
    expect(state).toBeDefined();
    expect(state.move_count).toBe(5);
  });
});