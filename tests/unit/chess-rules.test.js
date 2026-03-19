
// Chess Rules Unit Tests
// Tests for all piece movement rules, check detection, and checkmate

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

// Chess rules implementation for testing
class ChessRules {
  static isValidPosition(row, col) {
    return row >= 0 && row < 10 && col >= 0 && col < 9;
  }

  static getJiangMoves(row, col, color, board) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    
    const minRow = color === 'red' ? 7 : 0;
    const maxRow = color === 'red' ? 9 : 2;
    const minCol = 3;
    const maxCol = 5;

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
        const target = board[newRow][newCol];
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol });
        }
      }
    }

    // Flying general rule
    const opponentColor = color === 'red' ? 'black' : 'red';
    for (let r = 0; r < 10; r++) {
      if (board[r][col] && board[r][col].type === 'jiang' && board[r][col].color === opponentColor) {
        let blocked = false;
        const startRow = Math.min(row, r);
        const endRow = Math.max(row, r);
        
        for (let checkRow = startRow + 1; checkRow < endRow; checkRow++) {
          if (board[checkRow][col]) {
            blocked = true;
            break;
          }
        }
        
        if (!blocked) {
          moves.push({ row: r, col: col });
        }
      }
    }

    return moves;
  }

  static getShiMoves(row, col, color, board) {
    const moves = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    
    const minRow = color === 'red' ? 7 : 0;
    const maxRow = color === 'red' ? 9 : 2;
    const minCol = 3;
    const maxCol = 5;

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
        const target = board[newRow][newCol];
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol });
        }
      }
    }

    return moves;
  }

  static getXiangMoves(row, col, color, board) {
    const moves = [];
    const directions = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    const blocks = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (let i = 0; i < directions.length; i++) {
      const [dr, dc] = directions[i];
      const [br, bc] = blocks[i];
      const newRow = row + dr;
      const newCol = col + dc;
      const blockRow = row + br;
      const blockCol = col + bc;

      if (!this.isValidPosition(newRow, newCol)) continue;
      
      if (color === 'red' && newRow < 5) continue;
      if (color === 'black' && newRow > 4) continue;
      
      if (!board[blockRow][blockCol]) {
        const target = board[newRow][newCol];
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol });
        }
      }
    }

    return moves;
  }

  static getMaMoves(row, col, color, board) {
    const moves = [];
    const jumps = [
      { move: [-2, -1], block: [-1, 0] },
      { move: [-2, 1], block: [-1, 0] },
      { move: [2, -1], block: [1, 0] },
      { move: [2, 1], block: [1, 0] },
      { move: [-1, -2], block: [0, -1] },
      { move: [1, -2], block: [0, -1] },
      { move: [-1, 2], block: [0, 1] },
      { move: [1, 2], block: [0, 1] }
    ];

    for (const jump of jumps) {
      const newRow = row + jump.move[0];
      const newCol = col + jump.move[1];
      const blockRow = row + jump.block[0];
      const blockCol = col + jump.block[1];

      if (!this.isValidPosition(newRow, newCol)) continue;
      
      if (board[blockRow] && board[blockRow][blockCol]) continue;
      
      const target = board[newRow][newCol];
      if (!target || target.color !== color) {
        moves.push({ row: newRow, col: newCol });
      }
    }

    return moves;
  }

  static getJuMoves(row, col, color, board) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of directions) {
      let newRow = row + dr;
      let newCol = col + dc;

      while (this.isValidPosition(newRow, newCol)) {
        const target = board[newRow][newCol];
        if (!target) {
          moves.push({ row: newRow, col: newCol });
        } else {
          if (target.color !== color) {
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

  static getPaoMoves(row, col, color, board) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dr, dc] of directions) {
      let newRow = row + dr;
      let newCol = col + dc;
      let jumped = false;

      while (this.isValidPosition(newRow, newCol)) {
        const target = board[newRow][newCol];
        
        if (!jumped) {
          if (!target) {
            moves.push({ row: newRow, col: newCol });
          } else {
            jumped = true;
          }
        } else {
          if (target) {
            if (target.color !== color) {
              moves.push({ row: newRow, col: newCol });
            }
            break;
          }
        }
        newRow += dr;
        newCol += dc;
      }
    }

    return moves;
  }

  static getZuMoves(row, col, color, board) {
    const moves = [];
    const forward = color === 'red' ? -1 : 1;
    const crossedRiver = color === 'red' ? row <= 4 : row >= 5;

    const newRow = row + forward;
    if (this.isValidPosition(newRow, col)) {
      const target = board[newRow][col];
      if (!target || target.color !== color) {
        moves.push({ row: newRow, col: col });
      }
    }

    if (crossedRiver) {
      for (const dc of [-1, 1]) {
        const newCol = col + dc;
        if (this.isValidPosition(row, newCol)) {
          const target = board[row][newCol];
          if (!target || target.color !== color) {
            moves.push({ row: row, col: newCol });
          }
        }
      }
    }

    return moves;
  }

  static findKing(board, color) {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (piece && piece.type === 'jiang' && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  static isKingInCheck(board, color) {
    const king = this.findKing(board, color);
    if (!king) return false;

    const opponentColor = color === 'red' ? 'black' : 'red';

    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (piece && piece.color === opponentColor) {
          let moves = [];
          switch (piece.type) {
            case 'jiang': moves = this.getJiangMoves(row, col, piece.color, board); break;
            case 'shi': moves = this.getShiMoves(row, col, piece.color, board); break;
            case 'xiang': moves = this.getXiangMoves(row, col, piece.color, board); break;
            case 'ma': moves = this.getMaMoves(row, col, piece.color, board); break;
            case 'ju': moves = this.getJuMoves(row, col, piece.color, board); break;
            case 'pao': moves = this.getPaoMoves(row, col, piece.color, board); break;
            case 'zu': moves = this.getZuMoves(row, col, piece.color, board); break;
          }
          if (moves.some(m => m.row === king.row && m.col === king.col)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

// ========================================
// Tests
// ========================================

describe('Chess Rules - Jiang (King)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move one step horizontally within palace', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 9, col: 3 });
    expect(moves).toContainEqual({ row: 9, col: 5 });
  });

  it('should move one step vertically within palace', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 8, col: 4 });
  });

  it('should not move outside palace', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    // Should not be able to move to row 10 (outside board)
    expect(moves).not.toContainEqual({ row: 10, col: 4 });
    // Should not be able to move to column 2 (outside palace)
    expect(moves).not.toContainEqual({ row: 9, col: 2 });
  });

  it('should capture opponent king with flying general rule', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[0][4] = { type: 'jiang', color: 'black', name: '將' };
    
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 0, col: 4 });
  });

  it('should not apply flying general rule when opponent king is outside palace', () => {
    // Red king in palace, black king outside palace (moved out illegally)
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[3][4] = { type: 'jiang', color: 'black', name: '將' }; // Black king outside palace
    
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    // Should not be able to capture because black king is outside palace
    expect(moves).not.toContainEqual({ row: 3, col: 4 });
  });

  it('should not apply flying general rule when kings are in different columns', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[0][3] = { type: 'jiang', color: 'black', name: '將' }; // Different column
    
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    // Should not be able to capture because kings are in different columns
    expect(moves).not.toContainEqual({ row: 0, col: 3 });
  });

  it('should not capture opponent king if blocked', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[5][4] = { type: 'zu', color: 'red', name: '兵' };
    board[0][4] = { type: 'jiang', color: 'black', name: '將' };
    
    const moves = ChessRules.getJiangMoves(9, 4, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 0, col: 4 });
  });
});

describe('Chess Rules - Shi (Advisor)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move diagonally within palace', () => {
    board[9][4] = { type: 'shi', color: 'red', name: '仕' };
    const moves = ChessRules.getShiMoves(9, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 8, col: 3 });
    expect(moves).toContainEqual({ row: 8, col: 5 });
  });

  it('should not move outside palace', () => {
    board[9][4] = { type: 'shi', color: 'red', name: '仕' };
    const moves = ChessRules.getShiMoves(9, 4, 'red', board);
    
    expect(moves.length).toBe(2);
  });

  it('should move from corner to center', () => {
    board[9][3] = { type: 'shi', color: 'red', name: '仕' };
    const moves = ChessRules.getShiMoves(9, 3, 'red', board);
    
    expect(moves).toContainEqual({ row: 8, col: 4 });
  });
});

describe('Chess Rules - Xiang (Elephant)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move two steps diagonally', () => {
    board[9][2] = { type: 'xiang', color: 'red', name: '相' };
    const moves = ChessRules.getXiangMoves(9, 2, 'red', board);
    
    expect(moves).toContainEqual({ row: 7, col: 0 });
    expect(moves).toContainEqual({ row: 7, col: 4 });
  });

  it('should not cross river', () => {
    board[9][2] = { type: 'xiang', color: 'red', name: '相' };
    const moves = ChessRules.getXiangMoves(9, 2, 'red', board);
    
    // All moves should be in rows 5-9 for red
    moves.forEach(move => {
      expect(move.row).toBeGreaterThanOrEqual(5);
    });
  });

  it('should be blocked by piece at eye position', () => {
    board[9][2] = { type: 'xiang', color: 'red', name: '相' };
    board[8][3] = { type: 'zu', color: 'black', name: '卒' };
    
    const moves = ChessRules.getXiangMoves(9, 2, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 7, col: 4 });
  });
});

describe('Chess Rules - Ma (Horse)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move in L-shape', () => {
    board[5][5] = { type: 'ma', color: 'red', name: '馬' };
    const moves = ChessRules.getMaMoves(5, 5, 'red', board);
    
    expect(moves.length).toBe(8);
    expect(moves).toContainEqual({ row: 3, col: 4 });
    expect(moves).toContainEqual({ row: 3, col: 6 });
    expect(moves).toContainEqual({ row: 7, col: 4 });
    expect(moves).toContainEqual({ row: 7, col: 6 });
  });

  it('should be blocked by piece at leg position', () => {
    board[5][5] = { type: 'ma', color: 'red', name: '馬' };
    board[4][5] = { type: 'zu', color: 'black', name: '卒' };
    
    const moves = ChessRules.getMaMoves(5, 5, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 3, col: 4 });
    expect(moves).not.toContainEqual({ row: 3, col: 6 });
  });
});

describe('Chess Rules - Ju (Chariot)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move horizontally any distance', () => {
    board[5][4] = { type: 'ju', color: 'red', name: '車' };
    const moves = ChessRules.getJuMoves(5, 4, 'red', board);
    
    // Should be able to move to all columns in row 5
    expect(moves).toContainEqual({ row: 5, col: 0 });
    expect(moves).toContainEqual({ row: 5, col: 8 });
  });

  it('should move vertically any distance', () => {
    board[5][4] = { type: 'ju', color: 'red', name: '車' };
    const moves = ChessRules.getJuMoves(5, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 0, col: 4 });
    expect(moves).toContainEqual({ row: 9, col: 4 });
  });

  it('should be blocked by own piece', () => {
    board[5][4] = { type: 'ju', color: 'red', name: '車' };
    board[5][7] = { type: 'zu', color: 'red', name: '兵' };
    
    const moves = ChessRules.getJuMoves(5, 4, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 5, col: 8 });
  });

  it('should capture opponent piece', () => {
    board[5][4] = { type: 'ju', color: 'red', name: '車' };
    board[5][7] = { type: 'zu', color: 'black', name: '卒' };
    
    const moves = ChessRules.getJuMoves(5, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 5, col: 7 });
  });
});

describe('Chess Rules - Pao (Cannon)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move like chariot when not capturing', () => {
    board[5][4] = { type: 'pao', color: 'red', name: '炮' };
    const moves = ChessRules.getPaoMoves(5, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 5, col: 0 });
    expect(moves).toContainEqual({ row: 5, col: 8 });
    expect(moves).toContainEqual({ row: 0, col: 4 });
    expect(moves).toContainEqual({ row: 9, col: 4 });
  });

  it('should capture by jumping over one piece', () => {
    board[5][4] = { type: 'pao', color: 'red', name: '炮' };
    board[5][6] = { type: 'zu', color: 'red', name: '兵' };
    board[5][8] = { type: 'zu', color: 'black', name: '卒' };
    
    const moves = ChessRules.getPaoMoves(5, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 5, col: 8 });
    expect(moves).not.toContainEqual({ row: 5, col: 7 });
  });

  it('should not capture without jumping', () => {
    board[5][4] = { type: 'pao', color: 'red', name: '炮' };
    board[5][6] = { type: 'zu', color: 'black', name: '卒' };
    
    const moves = ChessRules.getPaoMoves(5, 4, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 5, col: 6 });
  });
});

describe('Chess Rules - Zu (Pawn)', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should move forward only before crossing river', () => {
    board[6][4] = { type: 'zu', color: 'red', name: '兵' };
    const moves = ChessRules.getZuMoves(6, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 5, col: 4 });
    expect(moves).not.toContainEqual({ row: 6, col: 3 });
    expect(moves).not.toContainEqual({ row: 6, col: 5 });
  });

  it('should move forward and sideways after crossing river', () => {
    board[4][4] = { type: 'zu', color: 'red', name: '兵' };
    const moves = ChessRules.getZuMoves(4, 4, 'red', board);
    
    expect(moves).toContainEqual({ row: 3, col: 4 });
    expect(moves).toContainEqual({ row: 4, col: 3 });
    expect(moves).toContainEqual({ row: 4, col: 5 });
  });

  it('should not move backward', () => {
    board[4][4] = { type: 'zu', color: 'red', name: '兵' };
    const moves = ChessRules.getZuMoves(4, 4, 'red', board);
    
    expect(moves).not.toContainEqual({ row: 5, col: 4 });
  });
});

describe('Check Detection', () => {
  let board;

  beforeEach(() => {
    board = createEmptyBoard();
  });

  it('should detect check by chariot', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[5][4] = { type: 'ju', color: 'black', name: '車' };
    
    expect(ChessRules.isKingInCheck(board, 'red')).toBe(true);
  });

  it('should detect check by horse', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[7][5] = { type: 'ma', color: 'black', name: '馬' };
    
    expect(ChessRules.isKingInCheck(board, 'red')).toBe(true);
  });

  it('should detect check by cannon', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[5][4] = { type: 'pao', color: 'black', name: '砲' };
    board[7][4] = { type: 'zu', color: 'red', name: '兵' };
    
    expect(ChessRules.isKingInCheck(board, 'red')).toBe(true);
  });

  it('should not detect check when blocked', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[5][4] = { type: 'ju', color: 'black', name: '車' };
    board[7][4] = { type: 'zu', color: 'red', name: '兵' };
    
    expect(ChessRules.isKingInCheck(board, 'red')).toBe(false);
  });

  it('should detect flying general check', () => {
    board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
    board[0][4] = { type: 'jiang', color: 'black', name: '將' };
    
    expect(ChessRules.isKingInCheck(board, 'red')).toBe(true);
    expect(ChessRules.isKingInCheck(board, 'black')).toBe(true);
  });
});

describe('Initial Board Setup', () => {
  it('should have correct number of pieces', () => {
    const board = createInitialBoard();
    
    let redPieces = 0;
    let blackPieces = 0;
    
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col]) {
          if (board[row][col].color === 'red') redPieces++;
          else blackPieces++;
        }
      }
    }
    
    expect(redPieces).toBe(16);
    expect(blackPieces).toBe(16);
  });

  it('should have kings in correct positions', () => {
    const board = createInitialBoard();
    
    expect(board[0][4]).toEqual({ type: 'jiang', color: 'black', name: '將' });
    expect(board[9][4]).toEqual({ type: 'jiang', color: 'red', name: '帥' });
  });

  it('should have chariots in corners', () => {
    const board = createInitialBoard();
    
    expect(board[0][0].type).toBe('ju');
    expect(board[0][8].type).toBe('ju');
    expect(board[9][0].type).toBe('ju');
    expect(board[9][8].type).toBe('ju');
  });
});
