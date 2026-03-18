// ============================================
// Chinese Chess - Cloudflare Pages Functions
// Advanced Mode: This file is the entry point for Pages Functions
// NO Durable Objects - Direct WebSocket handling with D1 persistence
// ============================================

// ============================================
// Constants
// ============================================

const INITIAL_BOARD = [
  ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', 'c', '.', '.', '.', '.', '.', 'c', '.'],
  ['p', '.', 'p', '.', 'p', '.', 'p', '.', 'p'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['P', '.', 'P', '.', 'P', '.', 'P', '.', 'P'],
  ['.', 'C', '.', '.', '.', '.', '.', 'C', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
  ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
];

// ============================================
// In-Memory State (per isolate instance)
// ============================================

// Map of roomId -> { sessions: Map<sessionId, session>, gameState: object }
const rooms = new Map();

// ============================================
// Database Initialization (cached per isolate)
// ============================================

let dbInitialized = false;

async function initializeDatabase(db) {
  if (dbInitialized) return true;
  
  try {
    console.log('[DB] Starting database initialization...');
    
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          red_player_id TEXT,
          black_player_id TEXT,
          status TEXT DEFAULT 'waiting'
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS game_state (
          room_id TEXT PRIMARY KEY,
          board TEXT NOT NULL,
          current_turn TEXT NOT NULL,
          last_move TEXT,
          move_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'playing',
          winner TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          color TEXT NOT NULL,
          connected INTEGER DEFAULT 1,
          last_seen INTEGER NOT NULL,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at)`)
    ]);
    
    dbInitialized = true;
    console.log('[DB] Database initialized successfully');
    return true;
  } catch (error) {
    console.error('[DB] Initialization error:', error);
    return false;
  }
}

// ============================================
// Room Management
// ============================================

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      sessions: new Map(),
      gameState: null
    });
  }
  return rooms.get(roomId);
}

// ============================================
// WebSocket Handlers
// ============================================

async function handleWebSocketMessage(ws, message, env, roomId) {
  try {
    const data = JSON.parse(message);
    
    const session = ws.session;
    if (!session || !session.sessionId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
      return;
    }

    switch (data.type) {
      case 'join':
        await handleJoin(ws, session.sessionId, data, env, roomId);
        break;
      case 'move':
        await handleMove(ws, session.sessionId, data, env, roomId);
        break;
      case 'chat':
        handleChat(ws, session.sessionId, data, roomId);
        break;
      case 'restart':
        await handleRestart(ws, session.sessionId, env, roomId);
        break;
      case 'resign':
        await handleResign(ws, session.sessionId, env, roomId);
        break;
      case 'ready':
        handleReady(ws, session.sessionId, roomId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'pong':
        if (session) {
          session.lastSeen = Date.now();
        }
        break;
      default:
        console.log('[WS] Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('[WS] Error handling message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to process message'
    }));
  }
}

async function handleJoin(ws, sessionId, data, env, roomId) {
  const { playerName, roomId: requestedRoomId, roomName } = data;
  const room = getOrCreateRoom(roomId);

  let assignedColor = null;

  // Check database for room info
  let dbRoom = await env.DB.prepare(
    'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE id = ?'
  ).bind(roomId).first();

  if (!dbRoom) {
    // Create new room
    const newRoomName = roomName || roomId;
    
    await env.DB.prepare(
      'INSERT INTO rooms (id, name, created_at, status) VALUES (?, ?, ?, ?)'
    ).bind(roomId, newRoomName, Date.now(), 'waiting').run();

    assignedColor = 'red';
    await env.DB.prepare(
      'UPDATE rooms SET red_player_id = ?, status = ? WHERE id = ?'
    ).bind(sessionId, 'waiting', roomId).run();

    dbRoom = { id: roomId, name: newRoomName, status: 'waiting', red_player_id: sessionId };
  } else {
    // Room exists, check if full
    if (dbRoom.red_player_id && dbRoom.black_player_id) {
      // Check for reconnection
      if (dbRoom.red_player_id === sessionId || dbRoom.black_player_id === sessionId) {
        assignedColor = dbRoom.red_player_id === sessionId ? 'red' : 'black';
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: '房间已满'
        }));
        return;
      }
    } else if (!dbRoom.red_player_id) {
      assignedColor = 'red';
      await env.DB.prepare(
        'UPDATE rooms SET red_player_id = ? WHERE id = ?'
      ).bind(sessionId, roomId).run();
    } else {
      assignedColor = 'black';
      await env.DB.prepare(
        'UPDATE rooms SET black_player_id = ?, status = ? WHERE id = ?'
      ).bind(sessionId, roomId, 'playing').run();
    }
  }

  // Setup session
  const session = {
    sessionId: sessionId,
    color: assignedColor,
    playerName: playerName || `Player_${sessionId.slice(0, 4)}`,
    roomId: roomId,
    lastSeen: Date.now()
  };

  ws.session = session;
  room.sessions.set(sessionId, { ...session, websocket: ws });

  // Update database player record
  await env.DB.prepare(
    'INSERT OR REPLACE INTO players (id, room_id, color, connected, last_seen) VALUES (?, ?, ?, 1, ?)'
  ).bind(sessionId, roomId, assignedColor, Date.now()).run();

  // Load game state
  await loadGameState(roomId, env);

  // Send join confirmation
  ws.send(JSON.stringify({
    type: 'joined',
    roomId: roomId,
    roomName: dbRoom.name,
    color: assignedColor,
    playerName: session.playerName,
    gameState: room.gameState
  }));

  // Broadcast to other players
  broadcastToRoom(roomId, {
    type: 'player_joined',
    playerName: session.playerName,
    color: assignedColor
  }, sessionId);
}

async function handleMove(ws, sessionId, data, env, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const session = room.sessions.get(sessionId);
  if (!session || !session.color) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a game' }));
    return;
  }

  if (!room.gameState) {
    await loadGameState(roomId, env);
  }

  if (room.gameState.current_turn !== session.color) {
    ws.send(JSON.stringify({ type: 'error', message: '不是你的回合' }));
    return;
  }

  const { from, to } = data;

  if (!validateMove(room.gameState, from, to, session.color)) {
    ws.send(JSON.stringify({ type: 'error', message: '无效的移动' }));
    return;
  }

  const piece = room.gameState.board[from.row][from.col];
  const captured = room.gameState.board[to.row][to.col];
  
  // Apply move
  room.gameState.board[to.row][to.col] = piece;
  room.gameState.board[from.row][from.col] = '.';
  room.gameState.last_move = { from, to, piece, captured };
  room.gameState.move_count++;
  room.gameState.current_turn = session.color === 'red' ? 'black' : 'red';
  room.gameState.updated_at = Date.now();

  // Check for game over
  if (captured && captured.toUpperCase() === 'K') {
    room.gameState.status = 'ended';
    room.gameState.winner = session.color;
  }

  // Save to database
  await saveGameState(roomId, room.gameState, env);

  // Broadcast move to all players
  broadcastToRoom(roomId, {
    type: 'move',
    from: from,
    to: to,
    piece: piece,
    captured: captured,
    current_turn: room.gameState.current_turn,
    move_count: room.gameState.move_count,
    game_status: room.gameState.status,
    winner: room.gameState.winner,
    moved_by: session.color
  });
}

function handleChat(ws, sessionId, data, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const session = room.sessions.get(sessionId);
  if (!session) return;

  broadcastToRoom(roomId, {
    type: 'chat',
    playerName: session.playerName,
    color: session.color,
    message: data.message
  });
}

async function handleRestart(ws, sessionId, env, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.gameState = {
    board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
    current_turn: 'red',
    last_move: null,
    move_count: 0,
    status: 'playing',
    winner: null,
    updated_at: Date.now()
  };

  await saveGameState(roomId, room.gameState, env);

  broadcastToRoom(roomId, {
    type: 'game_restarted',
    gameState: room.gameState
  });
}

async function handleResign(ws, sessionId, env, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const session = room.sessions.get(sessionId);
  if (!session || !session.color) return;

  room.gameState.status = 'ended';
  room.gameState.winner = session.color === 'red' ? 'black' : 'red';
  room.gameState.updated_at = Date.now();

  await saveGameState(roomId, room.gameState, env);

  broadcastToRoom(roomId, {
    type: 'game_ended',
    reason: 'resign',
    winner: room.gameState.winner
  });
}

function handleReady(ws, sessionId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const session = room.sessions.get(sessionId);
  if (!session) return;

  session.ready = true;

  broadcastToRoom(roomId, {
    type: 'player_ready',
    color: session.color
  });
}

// ============================================
// Game State Persistence
// ============================================

async function loadGameState(roomId, env) {
  const room = getOrCreateRoom(roomId);

  const state = await env.DB.prepare(
    'SELECT * FROM game_state WHERE room_id = ?'
  ).bind(roomId).first();

  if (state) {
    room.gameState = {
      board: JSON.parse(state.board),
      current_turn: state.current_turn,
      last_move: state.last_move ? JSON.parse(state.last_move) : null,
      move_count: state.move_count,
      status: state.status,
      winner: state.winner || null,
      updated_at: state.updated_at
    };
  } else {
    room.gameState = {
      board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
      current_turn: 'red',
      last_move: null,
      move_count: 0,
      status: 'playing',
      winner: null,
      updated_at: Date.now()
    };
    await saveGameState(roomId, room.gameState, env);
  }

  return room.gameState;
}

async function saveGameState(roomId, gameState, env) {
  if (!gameState) return;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO game_state 
    (room_id, board, current_turn, last_move, move_count, status, winner, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    roomId,
    JSON.stringify(gameState.board),
    gameState.current_turn,
    JSON.stringify(gameState.last_move),
    gameState.move_count,
    gameState.status,
    gameState.winner || null,
    gameState.updated_at
  ).run();
}

// ============================================
// Move Validation
// ============================================

function validateMove(gameState, from, to, playerColor) {
  if (!from || !to) return false;
  if (from.row < 0 || from.row > 9 || from.col < 0 || from.col > 8) return false;
  if (to.row < 0 || to.row > 9 || to.col < 0 || to.col > 8) return false;

  const piece = gameState.board[from.row][from.col];
  if (piece === '.') return false;

  const isRedPiece = piece === piece.toUpperCase();
  const isRedTurn = gameState.current_turn === 'red';
  if (isRedPiece !== isRedTurn) return false;

  const target = gameState.board[to.row][to.col];
  if (target !== '.') {
    const targetIsRed = target === target.toUpperCase();
    if (targetIsRed === isRedPiece) return false;
  }

  return true;
}

// ============================================
// Broadcast Helper
// ============================================

function broadcastToRoom(roomId, message, excludeSessionId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const [sessionId, session] of room.sessions) {
    if (sessionId !== excludeSessionId && session.websocket) {
      try {
        session.websocket.send(data);
      } catch (e) {
        console.error('[WS] Failed to send to session:', sessionId);
      }
    }
  }
}

// ============================================
// Handle WebSocket Close
// ============================================

async function handleWebSocketClose(ws, env, roomId) {
  const session = ws.session;
  if (!session) return;

  const room = rooms.get(roomId);
  if (!room) return;

  // Remove from database
  await env.DB.prepare(
    'DELETE FROM players WHERE id = ?'
  ).bind(session.sessionId).run();

  // Update room status
  if (session.color) {
    const column = session.color === 'red' ? 'red_player_id' : 'black_player_id';
    await env.DB.prepare(
      `UPDATE rooms SET ${column} = NULL, status = 'waiting' WHERE id = ?`
    ).bind(roomId).run();
  }

  // Remove from memory
  room.sessions.delete(session.sessionId);

  // Broadcast leave
  broadcastToRoom(roomId, {
    type: 'player_left',
    playerName: session.playerName,
    color: session.color
  }, session.sessionId);
}

// ============================================
// Main Worker Entry Point
// ============================================

async function fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (env.DB) {
      await initializeDatabase(env.DB);
    }
    
    if (url.pathname === '/ws') {
      return handleWebSocketUpgrade(request, env, url);
    }
    
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, url);
    }
    
    // Serve static assets from Pages
    return env.ASSETS.fetch(request);
}

export default { fetch };

// ============================================
// WebSocket Upgrade Handler
// ============================================

async function handleWebSocketUpgrade(request, env, url) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }
  
  const roomId = url.searchParams.get('roomId');
  if (!roomId) {
    return new Response('Room ID required', { status: 400 });
  }

  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  // Generate session ID
  const sessionId = crypto.randomUUID();

  // Setup session info on the server WebSocket
  server.session = {
    sessionId: sessionId
  };

  // Accept the WebSocket
  server.accept();

  // Store reference for cleanup
  const room = getOrCreateRoom(roomId);

  // Send session ID
  server.send(JSON.stringify({
    type: 'session',
    sessionId: sessionId
  }));

  // Handle messages
  server.addEventListener('message', async (event) => {
    await handleWebSocketMessage(server, event.data, env, roomId);
  });

  // Handle close
  server.addEventListener('close', async (event) => {
    await handleWebSocketClose(server, env, roomId);
  });

  // Handle error
  server.addEventListener('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

// ============================================
// REST API Handler
// ============================================

async function handleApiRequest(request, env, url) {
  if (url.pathname === '/api/room/lookup' && request.method === 'GET') {
    const roomName = url.searchParams.get('name');
    if (!roomName) {
      return new Response(JSON.stringify({ error: 'Room name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const room = await env.DB.prepare(
      'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE name = ?'
    ).bind(roomName.trim()).first();
    
    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(room), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('Not found', { status: 404 });
}
