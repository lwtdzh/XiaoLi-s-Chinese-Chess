// Test setup file for Chinese Chess project
// This file configures the test environment

import { vi } from 'vitest';

// Mock WebSocket for testing
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;  // Start in CONNECTING state (not OPEN)
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }
  
  // Helper to simulate connection open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen({ type: 'open' });
    }
  }
  
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Echo back for testing
    console.log('MockWebSocket sent:', data);
  }
  
  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, type: 'close' });
    }
  }
  
  // Helper to simulate receiving messages
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
  
  // Helper to simulate errors
  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// Mock D1 Database for testing
class MockD1Database {
  constructor() {
    this.data = new Map();
    this.nextId = 1;
  }
  
  prepare(sql) {
    return new MockStatement(sql, this);
  }
  
  batch(statements) {
    return Promise.all(statements.map(s => s.run()));
  }
  
  // Helper to seed test data
  seed(table, rows) {
    if (!this.data.has(table)) {
      this.data.set(table, []);
    }
    this.data.get(table).push(...rows);
  }
  
  // Helper to clear all data
  clear() {
    this.data.clear();
  }
}

class MockStatement {
  constructor(sql, db) {
    this.sql = sql;
    this.db = db;
    this.bindings = [];
  }
  
  bind(...values) {
    this.bindings = values;
    return this;
  }
  
  async first() {
    const table = this.extractTable();
    const rows = this.db.data.get(table) || [];
    
    if (this.sql.includes('SELECT')) {
      // Improved WHERE clause matching - match all binding values
      if (this.bindings.length > 0) {
        return rows.find(row => 
          this.bindings.every((val, i) => 
            Object.values(row).includes(val)
          )
        ) || null;
      }
      return rows[0] || null;
    }
    
    return null;
  }
  
  async run() {
    const table = this.extractTable();
    
    if (this.sql.includes('INSERT')) {
      if (!this.db.data.has(table)) {
        this.db.data.set(table, []);
      }
      const row = this.createRowFromBindings();
      this.db.data.get(table).push(row);
      return { success: true, meta: { changes: 1 } };
    }
    
    if (this.sql.includes('UPDATE')) {
      return { success: true, meta: { changes: 1 } };
    }
    
    if (this.sql.includes('DELETE')) {
      return { success: true, meta: { changes: 1 } };
    }
    
    if (this.sql.includes('CREATE TABLE')) {
      this.db.data.set(table, []);
      return { success: true };
    }
    
    return { success: true };
  }
  
  async all() {
    const table = this.extractTable();
    return { results: this.db.data.get(table) || [] };
  }
  
  extractTable() {
    const match = this.sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+(\w+)/i);
    return match ? match[1] : 'unknown';
  }
  
  createRowFromBindings() {
    const row = {};
    // Simple row creation from bindings
    this.bindings.forEach((val, i) => {
      row[`col${i}`] = val;
    });
    return row;
  }
}

// Mock Cloudflare environment
function createMockEnv() {
  return {
    DB: new MockD1Database()
  };
}

// Mock document for testing
function setupDOM() {
  if (typeof document === 'undefined') {
    global.document = {
      getElementById: vi.fn(() => ({
        textContent: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn(() => false)
        },
        addEventListener: vi.fn(),
        innerHTML: '',
        value: ''
      })),
      createElement: vi.fn(() => ({
        className: '',
        textContent: '',
        style: {},
        dataset: {},
        addEventListener: vi.fn(),
        appendChild: vi.fn()
      })),
      addEventListener: vi.fn(),
      DOMContentLoaded: 'DOMContentLoaded'
    };
    
    global.window = {
      location: {
        protocol: 'http:',
        host: 'localhost:5173'
      },
      WebSocket: MockWebSocket
    };
    
    global.console = {
      ...console,
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };
  }
}

// Export test utilities
export {
  MockWebSocket,
  MockD1Database,
  MockStatement,
  createMockEnv,
  setupDOM
};

// Cleanup function to reset mock state
export function resetMockState() {
  // Reset any global state if needed
  if (typeof global !== 'undefined') {
    if (global.console) {
      // Reset console mocks
      if (global.console.log.mockReset) global.console.log.mockReset();
      if (global.console.error.mockReset) global.console.error.mockReset();
      if (global.console.warn.mockReset) global.console.warn.mockReset();
    }
  }
}