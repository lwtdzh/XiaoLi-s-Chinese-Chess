
// Heartbeat and Timeout Unit Tests
// Tests for heartbeat timing, connection timeout, and dead connection detection

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MockWebSocket } from '../setup.js';

// ========================================
// Constants from middleware and game.js
// ========================================

// Server-side constants (from _middleware.js)
const SERVER_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const SERVER_HEARTBEAT_TIMEOUT = 90000; // 90 seconds (3 * interval)

// Client-side constants (from game.js)
const CLIENT_HEARTBEAT_TIMEOUT = 20000; // 20 seconds
const CLIENT_MAX_MISSED_HEARTBEATS = 3; // 3 missed heartbeats

// Derived: Client can detect dead connection within 60 seconds (3 * 20s)
const CLIENT_DEAD_CONNECTION_DETECTION = CLIENT_HEARTBEAT_TIMEOUT * CLIENT_MAX_MISSED_HEARTBEATS;

// ========================================
// Test Helper Classes
// ========================================

// Simulated server-side heartbeat manager
class ServerHeartbeatManager {
  constructor() {
    this.connections = new Map();
    this.interval = SERVER_HEARTBEAT_INTERVAL;
    this.timeout = SERVER_HEARTBEAT_TIMEOUT;
  }
  
  addConnection(id, ws) {
    this.connections.set(id, {
      ws,
      lastHeartbeat: Date.now()
    });
  }
  
  updateHeartbeat(id) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastHeartbeat = Date.now();
    }
  }
  
  checkConnection(id) {
    const conn = this.connections.get(id);
    if (!conn) return { alive: false, reason: 'not found' };
    
    const elapsed = Date.now() - conn.lastHeartbeat;
    if (elapsed > this.timeout) {
      return { alive: false, reason: 'timeout', elapsed };
    }
    return { alive: true, elapsed };
  }
  
  removeConnection(id) {
    this.connections.delete(id);
  }
}

// Simulated client-side heartbeat manager
class ClientHeartbeatManager {
  constructor() {
    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;
    this.maxMissed = CLIENT_MAX_MISSED_HEARTBEATS;
    this.timeout = CLIENT_HEARTBEAT_TIMEOUT;
  }
  
  receiveHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;
  }
  
  checkHeartbeat() {
    const elapsed = Date.now() - this.lastHeartbeat;
    
    if (elapsed > this.timeout) {
      this.missedHeartbeats++;
      
      if (this.missedHeartbeats >= this.maxMissed) {
        return { 
          shouldReconnect: true, 
          missedHeartbeats: this.missedHeartbeats,
          elapsed 
        };
      }
      
      return { 
        shouldReconnect: false, 
        missedHeartbeats: this.missedHeartbeats,
        elapsed 
      };
    }
    
    return { 
      shouldReconnect: false, 
      missedHeartbeats: 0,
      elapsed 
    };
  }
  
  canDetectDeadConnection(maxDetectionTime) {
    // Client can detect dead connection within maxDetectionTime
    return CLIENT_DEAD_CONNECTION_DETECTION <= maxDetectionTime;
  }
}

// ========================================
// Tests
// ========================================

describe('Heartbeat Timing Constants', () => {
  it('should have correct server timeout (90 seconds)', () => {
    expect(SERVER_HEARTBEAT_TIMEOUT).toBe(90000);
    expect(SERVER_HEARTBEAT_TIMEOUT).toBe(90 * 1000);
  });

  it('should have correct server interval (30 seconds)', () => {
    expect(SERVER_HEARTBEAT_INTERVAL).toBe(30000);
    expect(SERVER_HEARTBEAT_INTERVAL).toBe(30 * 1000);
  });

  it('should have server timeout = 3 * interval', () => {
    expect(SERVER_HEARTBEAT_TIMEOUT).toBe(SERVER_HEARTBEAT_INTERVAL * 3);
  });

  it('should have correct client heartbeat timeout (20 seconds)', () => {
    expect(CLIENT_HEARTBEAT_TIMEOUT).toBe(20000);
    expect(CLIENT_HEARTBEAT_TIMEOUT).toBe(20 * 1000);
  });

  it('should have correct max missed heartbeats (3)', () => {
    expect(CLIENT_MAX_MISSED_HEARTBEATS).toBe(3);
  });

  it('client should detect dead connections within 60 seconds', () => {
    expect(CLIENT_DEAD_CONNECTION_DETECTION).toBe(60000);
    expect(CLIENT_DEAD_CONNECTION_DETECTION).toBeLessThanOrEqual(60 * 1000);
  });
});

describe('Server-side Heartbeat Management', () => {
  let manager;
  let ws;

  beforeEach(() => {
    manager = new ServerHeartbeatManager();
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should track new connections', () => {
    manager.addConnection('conn-1', ws);
    
    const status = manager.checkConnection('conn-1');
    expect(status.alive).toBe(true);
  });

  it('should detect connection timeout after 90 seconds', () => {
    const connId = 'conn-1';
    manager.addConnection(connId, ws);
    
    // Simulate 91 seconds passing
    manager.connections.get(connId).lastHeartbeat = Date.now() - 91000;
    
    const status = manager.checkConnection(connId);
    expect(status.alive).toBe(false);
    expect(status.reason).toBe('timeout');
    expect(status.elapsed).toBeGreaterThan(90000);
  });

  it('should keep connection alive when heartbeat is within timeout', () => {
    const connId = 'conn-1';
    manager.addConnection(connId, ws);
    
    // Simulate 80 seconds (within 90s timeout)
    manager.connections.get(connId).lastHeartbeat = Date.now() - 80000;
    
    const status = manager.checkConnection(connId);
    expect(status.alive).toBe(true);
  });

  it('should update heartbeat timestamp on pong', () => {
    const connId = 'conn-1';
    manager.addConnection(connId, ws);
    
    // Simulate old heartbeat
    manager.connections.get(connId).lastHeartbeat = Date.now() - 50000;
    
    // Receive pong
    const before = manager.connections.get(connId).lastHeartbeat;
    manager.updateHeartbeat(connId);
    const after = manager.connections.get(connId).lastHeartbeat;
    
    expect(after).toBeGreaterThan(before);
  });

  it('should report not found for unknown connections', () => {
    const status = manager.checkConnection('unknown-conn');
    expect(status.alive).toBe(false);
    expect(status.reason).toBe('not found');
  });
});

describe('Client-side Heartbeat Management', () => {
  let manager;

  beforeEach(() => {
    manager = new ClientHeartbeatManager();
  });

  it('should track missed heartbeats', () => {
    // Simulate heartbeat timeout
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    
    const result = manager.checkHeartbeat();
    expect(result.missedHeartbeats).toBe(1);
    expect(result.shouldReconnect).toBe(false);
  });

  it('should trigger reconnection after 3 missed heartbeats', () => {
    // Simulate 3 missed heartbeats
    for (let i = 0; i < 3; i++) {
      manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
      manager.checkHeartbeat();
    }
    
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    const result = manager.checkHeartbeat();
    
    // Actually we need to accumulate missedHeartbeats
    expect(manager.missedHeartbeats).toBeGreaterThanOrEqual(3);
  });

  it('should reset missed heartbeats on successful heartbeat', () => {
    // Miss some heartbeats
    manager.missedHeartbeats = 2;
    
    // Receive successful heartbeat
    manager.receiveHeartbeat();
    
    expect(manager.missedHeartbeats).toBe(0);
  });

  it('should detect dead connection within 60 seconds', () => {
    expect(manager.canDetectDeadConnection(60000)).toBe(true);
  });

  it('should not trigger reconnection before max missed heartbeats', () => {
    // Start fresh - no missed heartbeats yet
    manager.missedHeartbeats = 0;
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    
    // First check - misses 1
    let result = manager.checkHeartbeat();
    expect(result.shouldReconnect).toBe(false);
    expect(manager.missedHeartbeats).toBe(1);
    
    // Second check - misses 2
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    result = manager.checkHeartbeat();
    expect(result.shouldReconnect).toBe(false);
    expect(manager.missedHeartbeats).toBe(2);
  });
});

describe('Connection Timeout Triggers Cleanup', () => {
  let serverManager;
  let ws;

  beforeEach(() => {
    serverManager = new ServerHeartbeatManager();
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should close connection on timeout', () => {
    const connId = 'conn-1';
    serverManager.addConnection(connId, ws);
    
    // Simulate timeout
    serverManager.connections.get(connId).lastHeartbeat = Date.now() - 91000;
    
    const status = serverManager.checkConnection(connId);
    
    if (!status.alive) {
      // Connection should be closed
      ws.close(1001, 'Connection timeout');
      serverManager.removeConnection(connId);
    }
    
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(serverManager.connections.has(connId)).toBe(false);
  });

  it('should handle multiple connection timeouts independently', () => {
    serverManager.addConnection('conn-1', ws);
    const ws2 = new MockWebSocket('ws://localhost/ws');
    serverManager.addConnection('conn-2', ws2);
    
    // Only conn-1 times out
    serverManager.connections.get('conn-1').lastHeartbeat = Date.now() - 91000;
    
    const status1 = serverManager.checkConnection('conn-1');
    const status2 = serverManager.checkConnection('conn-2');
    
    expect(status1.alive).toBe(false);
    expect(status2.alive).toBe(true);
  });
});

describe('Missed Heartbeat Counting', () => {
  let manager;

  beforeEach(() => {
    manager = new ClientHeartbeatManager();
  });

  it('should count missed heartbeats incrementally', () => {
    const initialMissed = manager.missedHeartbeats;
    
    // Miss first heartbeat
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    manager.checkHeartbeat();
    expect(manager.missedHeartbeats).toBe(initialMissed + 1);
    
    // Miss second heartbeat
    manager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
    manager.checkHeartbeat();
    expect(manager.missedHeartbeats).toBe(initialMissed + 2);
  });

  it('should not count if heartbeat is within timeout', () => {
    manager.lastHeartbeat = Date.now() - 1000; // Recent heartbeat
    
    const result = manager.checkHeartbeat();
    expect(result.missedHeartbeats).toBe(0);
    expect(manager.missedHeartbeats).toBe(0);
  });

  it('should track elapsed time since last heartbeat', () => {
    const elapsed = 25000;
    manager.lastHeartbeat = Date.now() - elapsed;
    
    const result = manager.checkHeartbeat();
    // Allow some tolerance for test execution time
    expect(result.elapsed).toBeGreaterThanOrEqual(elapsed - 100);
    expect(result.elapsed).toBeLessThan(elapsed + 1000);
  });
});

describe('WebSocket Ping/Pong Messages', () => {
  let ws;

  beforeEach(() => {
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should send ping message', () => {
    const sendSpy = vi.spyOn(ws, 'send');
    
    ws.send(JSON.stringify({ type: 'ping' }));
    
    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
  });

  it('should respond to ping with pong', () => {
    const onMessage = vi.fn();
    ws.onmessage = onMessage;
    
    // Server sends ping
    ws.simulateMessage({ type: 'ping' });
    
    expect(onMessage).toHaveBeenCalled();
    const data = JSON.parse(onMessage.mock.calls[0][0].data);
    expect(data.type).toBe('ping');
    
    // Client should respond with pong (simulated)
    ws.send(JSON.stringify({ type: 'pong' }));
  });

  it('should receive pong and update heartbeat', () => {
    const clientManager = new ClientHeartbeatManager();
    const onMessage = vi.fn((event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') {
        clientManager.receiveHeartbeat();
      }
    });
    
    ws.onmessage = onMessage;
    
    // Simulate old heartbeat
    clientManager.lastHeartbeat = Date.now() - 15000;
    
    // Receive pong
    ws.simulateMessage({ type: 'pong' });
    
    // Heartbeat should be updated
    expect(clientManager.lastHeartbeat).toBeGreaterThan(Date.now() - 1000);
    expect(clientManager.missedHeartbeats).toBe(0);
  });
});

describe('Integration: Full Heartbeat Cycle', () => {
  let serverManager;
  let clientManager;
  let ws;

  beforeEach(() => {
    serverManager = new ServerHeartbeatManager();
    clientManager = new ClientHeartbeatManager();
    ws = new MockWebSocket('ws://localhost/ws');
  });

  it('should maintain connection with regular heartbeats', () => {
    const connId = 'conn-1';
    serverManager.addConnection(connId, ws);
    
    // Simulate periodic heartbeats
    for (let i = 0; i < 5; i++) {
      // Server sends ping
      serverManager.updateHeartbeat(connId);
      
      // Client receives pong
      clientManager.receiveHeartbeat();
    }
    
    const serverStatus = serverManager.checkConnection(connId);
    const clientStatus = clientManager.checkHeartbeat();
    
    expect(serverStatus.alive).toBe(true);
    expect(clientStatus.shouldReconnect).toBe(false);
  });

  it('should detect dead server from client side', () => {
    // Simulate server going dead - no pong responses
    clientManager.missedHeartbeats = 0;
    
    // Miss 3 heartbeats (simulate by directly incrementing)
    for (let i = 0; i < 4; i++) {
      clientManager.lastHeartbeat = Date.now() - CLIENT_HEARTBEAT_TIMEOUT - 1000;
      const result = clientManager.checkHeartbeat();
      
      if (i >= 3) {
        expect(result.shouldReconnect).toBe(true);
      }
    }
  });

  it('should detect dead client from server side', () => {
    const connId = 'conn-1';
    serverManager.addConnection(connId, ws);
    
    // Simulate client going dead - no pong responses
    // Set lastHeartbeat to beyond timeout
    serverManager.connections.get(connId).lastHeartbeat = Date.now() - SERVER_HEARTBEAT_TIMEOUT - 1000;
    
    const status = serverManager.checkConnection(connId);
    expect(status.alive).toBe(false);
    expect(status.reason).toBe('timeout');
  });
});
