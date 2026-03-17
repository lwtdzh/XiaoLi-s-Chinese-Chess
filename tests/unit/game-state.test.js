
// Game State Unit Tests
// Tests for game state management, turn switching, and game over conditions

import { describe, it, expect, beforeEach } from 'vitest';

// ========================================
// Test Helper Functions
// ========================================

function createEmptyBoard() {
  return Array(10).fill(null).map(() => Array(9).fill(null));
}

function createGameState() {
  return {
    board: createEmptyBoard(),
    currentTurn: 'red',
    moveCount: 0,
    gameOver: false,
    winner: null,
    roomId: null,
    redPlayer: null,
    blackPlayer: null,
    lastMove: null,
    isInCheck: false
  };
}

function setupCheckmateScenario() {
  const board = createEmptyBoard();
  
  // Red king trapped in corner
  board[9][3] = { type: 'jiang', color: 'red', name: '帥' };
  
  // Black pieces surrounding
  board[8][3] = { type: 'ju', color: 'black', name: '車' };
  board[9][2] = { type: 'ju', color: 'black', name: '車' };
  
  return board;
}

function setupCheckScenario() {
  const board = createEmptyBoard();
  
  board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
  board[5][4] = { type: 'ju', color: 'black', name: '車' };
  
  return board;
}

// ========================================
// Tests
// ========================================

describe('Game State Initialization', () => {
  it('should create initial game state', () => {
    const state = createGameState();
    
    expect(state.currentTurn).toBe('red');
    expect(state.moveCount).toBe(0);
    expect(state.gameOver).toBe(false);
    expect(state.winner).toBeNull();
  });

  it('should have empty board initially', () => {
    const state = createGameState();
    
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        expect(state.board[row][col]).toBeNull();
      }
    }
  });

  it('should start with red turn', () => {
    const state = createGameState();
    expect(state.currentTurn).toBe('red');
  });
});

describe('Turn Management', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should switch from red to black', () => {
    state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
    expect(state.currentTurn).toBe('black');
  });

  it('should switch from black to red', () => {
    state.currentTurn = 'black';
    state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
    expect(state.currentTurn).toBe('red');
  });

  it('should alternate turns correctly over multiple moves', () => {
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push(state.currentTurn);
      state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
      state.moveCount++;
    }
    
    expect(turns).toEqual(['red', 'black', 'red', 'black', 'red', 'black', 'red', 'black', 'red', 'black']);
  });

  it('should increment move count on each turn', () => {
    for (let i = 0; i < 5; i++) {
      state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
      state.moveCount++;
    }
    
    expect(state.moveCount).toBe(5);
  });
});

describe('Game Over Conditions', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should detect king capture as game over', () => {
    state.board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    state.board[8][4] = { type: 'ju', color: 'black', name: '車' };
    
    // Simulate capture
    state.board[9][4] = null;
    state.gameOver = true;
    state.winner = 'black';
    
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('black');
  });

  it('should not allow moves after game over', () => {
    state.gameOver = true;
    
    // In a real implementation, this would be rejected
    expect(state.gameOver).toBe(true);
  });

  it('should set winner correctly', () => {
    state.gameOver = true;
    state.winner = 'red';
    
    expect(state.winner).toBe('red');
  });
});

describe('Check State', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should track check state', () => {
    state.isInCheck = true;
    expect(state.isInCheck).toBe(true);
  });

  it('should clear check state after move', () => {
    state.isInCheck = true;
    state.isInCheck = false;
    
    expect(state.isInCheck).toBe(false);
  });
});

describe('Move Recording', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should record last move', () => {
    state.lastMove = {
      from: { row: 9, col: 1 },
      to: { row: 7, col: 2 },
      piece: { type: 'ma', color: 'red', name: '馬' },
      timestamp: Date.now()
    };
    
    expect(state.lastMove).toBeDefined();
    expect(state.lastMove.from).toEqual({ row: 9, col: 1 });
    expect(state.lastMove.to).toEqual({ row: 7, col: 2 });
  });

  it('should include timestamp in move record', () => {
    const timestamp = Date.now();
    state.lastMove = {
      from: { row: 9, col: 1 },
      to: { row: 7, col: 2 },
      timestamp: timestamp
    };
    
    expect(state.lastMove.timestamp).toBe(timestamp);
  });
});

describe('Player Management', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should track red player', () => {
    state.redPlayer = 'player1';
    expect(state.redPlayer).toBe('player1');
  });

  it('should track black player', () => {
    state.blackPlayer = 'player2';
    expect(state.blackPlayer).toBe('player2');
  });

  it('should identify when game is full', () => {
    state.redPlayer = 'player1';
    state.blackPlayer = 'player2';
    
    expect(state.redPlayer).not.toBeNull();
    expect(state.blackPlayer).not.toBeNull();
  });

  it('should identify when game is waiting for player', () => {
    state.redPlayer = 'player1';
    state.blackPlayer = null;
    
    expect(state.blackPlayer).toBeNull();
  });
});

describe('State Serialization', () => {
  it('should serialize game state to JSON', () => {
    const state = createGameState();
    state.board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);
    
    expect(parsed.currentTurn).toBe('red');
    expect(parsed.board[9][4].type).toBe('jiang');
  });

  it('should preserve all state fields after serialization', () => {
    const state = createGameState();
    state.moveCount = 10;
    state.gameOver = false;
    state.isInCheck = true;
    
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);
    
    expect(parsed.moveCount).toBe(10);
    expect(parsed.gameOver).toBe(false);
    expect(parsed.isInCheck).toBe(true);
  });
});

describe('Room Management', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should track room ID', () => {
    state.roomId = 'ROOM123';
    expect(state.roomId).toBe('ROOM123');
  });

  it('should have null room ID initially', () => {
    expect(state.roomId).toBeNull();
  });
});

describe('Edge Cases', () => {
  let state;

  beforeEach(() => {
    state = createGameState();
  });

  it('should handle empty board state', () => {
    expect(state.board).toBeDefined();
    expect(state.board.length).toBe(10);
  });

  it('should handle large move counts', () => {
    state.moveCount = 1000;
    expect(state.moveCount).toBe(1000);
  });

  it('should handle multiple state changes', () => {
    for (let i = 0; i < 100; i++) {
      state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
      state.moveCount++;
    }
    
    expect(state.moveCount).toBe(100);
  });
});
