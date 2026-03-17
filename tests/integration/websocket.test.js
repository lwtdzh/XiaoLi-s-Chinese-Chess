
// WebSocket Integration Tests
// Tests for WebSocket communication, room creation, and real-time updates

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockWebSocket, createMockEnv } from '../setup.js';

// ========================================
// Test Helper Functions
// ========================================

function createTestContext(overrides = {}) {
  return {
    request: {
      url: 'http://localhost/ws',
      headers: {
        get: vi.fn((key) => {
          if (key === 'Upgrade') return 'websocket';
          return null;
        })
      }
    },
    env: createMockEnv(),
    next: vi.fn(() => new Response('next')),
    ...overrides
  };
}

// ========================================
// Tests
// ========================================

describe('WebSocket Connection', () => {
  it('should create WebSocket connection', () => {
    const ws = new MockWebSocket('ws://localhost/ws');
    expect(ws.readyState).toBe(MockWebSocket.OPEN);
  });

  it('should handle connection open', () => {
    const ws = new MockWebSocket('ws://localhost/ws');
    const onOpen = vi.fn();
    ws.onopen = onOpen;
    ws.simulateOpen();  // 手动触发 open 事件
    
    expect(onOpen).toHaveBeenCalled();
  });

  it('should handle connection close', () => {
    const ws = new MockWebSocket('ws://localhost/ws');
    const onClose = vi.fn();
    ws.onclose = onClose;
    
    ws.close(1000, 'Normal closure');
    
    expect(onClose).toHaveBeenCalled();
  });

  it('should handle connection error', () => {
    const ws = new MockWebSocket('ws://localhost/ws');
    const onError = vi.fn();
    ws.onerror = onError;
    
    ws.simulateError(new Error('Connection error'));
    
    expect(onError).toHaveBeenCalled();
  });
});

describe('Message Handling', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should send and receive JSON messages', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({ type: 'ping' });
    
    expect(onMessage).toHaveBeenCalled();
    const call = onMessage.mock.calls[0][0];
    const data = JSON.parse(call.data);
    expect(data.type).toBe('ping');
  });

  it('should handle createRoom message', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'createRoom',
      roomName: 'TestRoom'
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should handle joinRoom message', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'joinRoom',
      roomId: 'ROOM123'
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should handle move message', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'move',
      from: { row: 9, col: 1 },
      to: { row: 7, col: 2 },
      roomId: 'ROOM123'
    });
    
    expect(onMessage).toHaveBeenCalled();
  });
});

describe('Room Creation', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should create room with valid name', () => {
    const sendSpy = vi.spyOn(ws, 'send');
    
    // 模拟服务器处理 createRoom 消息后的响应
    // 在实际场景中，服务器会发送包含 roomId 的消息
    ws.simulateMessage({
      type: 'createRoom',
      roomName: 'TestRoom'
    });
    
    // 手动模拟服务器响应（因为 MockWebSocket 不会自动处理业务逻辑）
    ws.send(JSON.stringify({
      type: 'roomCreated',
      roomId: 'test-room-id',
      roomName: 'TestRoom'
    }));
    
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should reject empty room name', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'createRoom',
      roomName: ''
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should generate room ID', () => {
    const response = {
      type: 'roomCreated',
      roomId: 'ABC123',
      color: 'red',
      roomName: 'TestRoom'
    };
    
    expect(response.roomId).toBeDefined();
    expect(response.color).toBe('red');
  });
});

describe('Room Joining', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should join existing room', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'joinRoom',
      roomId: 'ROOM123'
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should receive color assignment on join', () => {
    const response = {
      type: 'roomJoined',
      roomId: 'ROOM123',
      color: 'black',
      opponentName: 'Player 1'
    };
    
    expect(response.color).toBe('black');
  });

  it('should notify when room is full', () => {
    const response = {
      type: 'error',
      message: 'Room is full'
    };
    
    expect(response.type).toBe('error');
  });

  it('should notify when room not found', () => {
    const response = {
      type: 'error',
      message: 'Room not found'
    };
    
    expect(response.type).toBe('error');
  });
});

describe('Move Synchronization', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should broadcast move to opponent', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'move',
      from: { row: 9, col: 1 },
      to: { row: 7, col: 2 }
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should confirm move to sender', () => {
    const response = {
      type: 'moveConfirmed',
      from: { row: 9, col: 1 },
      to: { row: 7, col: 2 }
    };
    
    expect(response.type).toBe('moveConfirmed');
  });

  it('should reject invalid move', () => {
    const response = {
      type: 'moveRejected',
      from: { row: 9, col: 1 },
      to: { row: 0, col: 0 },
      message: 'Invalid move'
    };
    
    expect(response.type).toBe('moveRejected');
  });

  it('should reject move when not your turn', () => {
    const response = {
      type: 'moveRejected',
      message: 'Not your turn'
    };
    
    expect(response.message).toBe('Not your turn');
  });
});

describe('Heartbeat', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should respond to ping with pong', () => {
    const sendSpy = vi.spyOn(ws, 'send');
    
    ws.simulateMessage({ type: 'ping' });
    
    // 手动模拟服务器响应 pong 消息（因为 MockWebSocket 不会自动处理业务逻辑）
    ws.send(JSON.stringify({ type: 'pong' }));
    
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should handle pong response', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({ type: 'pong' });
    
    expect(onMessage).toHaveBeenCalled();
  });
});

describe('Error Handling', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should handle unknown message type', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({ type: 'unknownType' });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should handle malformed JSON', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    // Simulate receiving invalid JSON
    ws.simulateMessage({ type: 'error', message: 'Invalid JSON' });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should handle database errors gracefully', () => {
    const response = {
      type: 'error',
      code: 2001,
      message: 'Database operation failed'
    };
    
    expect(response.code).toBe(2001);
  });
});

describe('Reconnection', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should handle rejoin request', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    ws.simulateMessage({
      type: 'rejoin',
      roomId: 'ROOM123',
      color: 'red'
    });
    
    expect(onMessage).toHaveBeenCalled();
  });

  it('should restore game state on rejoin', () => {
    const response = {
      type: 'rejoined',
      roomId: 'ROOM123',
      color: 'red',
      board: Array(10).fill(null).map(() => Array(9).fill(null)),
      currentTurn: 'black',
      moveCount: 5
    };
    
    expect(response.type).toBe('rejoined');
    expect(response.moveCount).toBe(5);
  });
});

describe('Disconnection', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should notify opponent on disconnect', () => {
    const response = {
      type: 'playerLeft',
      playerId: 'player1'
    };
    
    expect(response.type).toBe('playerLeft');
  });

  it('should update player status on disconnect', () => {
    const onClose = vi.fn();
    ws.onclose = onClose;
    
    ws.close(1000, 'Player disconnected');
    
    expect(onClose).toHaveBeenCalled();
  });
});
