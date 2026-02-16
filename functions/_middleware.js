
// Database initialization flag (in-memory, per-instance)
let dbInitialized = false;

// SQL schema for automatic initialization
const SCHEMA_SQL = `
-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    red_player_id TEXT,
    black_player_id TEXT,
    status TEXT DEFAULT 'waiting'
);

-- Game state table
CREATE TABLE IF NOT EXISTS game_state (
    room_id TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    current_turn TEXT NOT NULL,
    last_move TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    color TEXT NOT NULL,
    connected INTEGER DEFAULT 1,
    last_seen INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at);
`;

async function initializeDatabase(db) {
  if (dbInitialized) return true;
  
  try {
    console.log('[initializeDatabase] Starting database initialization...');
    
    // Create tables one by one using prepare().run() instead of exec()
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        red_player_id TEXT,
        black_player_id TEXT,
        status TEXT DEFAULT 'waiting'
      )
    `).run();
    
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS game_state (
        room_id TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        current_turn TEXT NOT NULL,
        last_move TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `).run();
    
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        color TEXT NOT NULL,
        connected INTEGER DEFAULT 1,
        last_seen INTEGER NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `).run();
    
    // Create indexes
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at)`).run();
    
    dbInitialized = true;
    console.log('[initializeDatabase] Database initialized successfully');
    return true;
  } catch (error) {
    console.error('[initializeDatabase] Error initializing database:', error);
    return false;
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Initialize database on first request
  if (context.env.DB) {
    await initializeDatabase(context.env.DB);
  }
  
  // Handle WebSocket upgrade
  if (url.pathname === '/ws') {
    return handleWebSocket(context);
  }
  
  // Serve static files
  return context.next();
}

// In-memory WebSocket connections (for real-time broadcasting)
// Database stores the persistent state
const connections = new Map();

async function handleWebSocket(context) {
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  // Initialize database before accepting WebSocket connection
  if (context.env.DB) {
    await initializeDatabase(context.env.DB);
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  
  const connectionId = generateConnectionId();
  connections.set(connectionId, { ws: server, roomId: null, playerId: null });
  
  server.addEventListener('message', async (msg) => {
    try {
      const data = JSON.parse(msg.data);
      await handleMessage(server, data, connectionId, context.env);
    } catch (error) {
      console.error('Error handling message:', error);
      server.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  server.addEventListener('close', async () => {
    await handleDisconnect(connectionId, context.env);
  });

  server.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

async function handleMessage(ws, data, connectionId, env) {
  const db = env.DB;
  
  switch (data.type) {
    case 'createRoom':
      await createRoom(ws, data.roomName, connectionId, db);
      break;
    case 'joinRoom':
      await joinRoom(ws, data.roomId, connectionId, db);
      break;
    case 'leaveRoom':
      await leaveRoom(ws, data.roomId, connectionId, db);
      break;
    case 'move':
      await handleMove(ws, data, connectionId, db);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'rejoin':
      await handleRejoin(ws, data, connectionId, db);
      break;
    case 'checkOpponent':
      await handleCheckOpponent(ws, data.roomId, connectionId, db);
      break;
    case 'checkMoves':
      await handleCheckMoves(ws, data, connectionId, db);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

async function createRoom(ws, roomName, connectionId, db) {
  try {
    console.log('[createRoom] Starting room creation:', { roomName, connectionId });
    
    // Check if database is available
    if (!db) {
      console.error('[createRoom] Database not available');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Database not configured. Please check D1 binding.'
      }));
      return;
    }
    
    // Check if room name already exists
    console.log('[createRoom] Checking for existing room...');
    const existingRoom = await db.prepare(
      'SELECT id FROM rooms WHERE name = ?'
    ).bind(roomName).first();
    
    if (existingRoom) {
      // Check if the existing room is stale (no connected players)
      const connectedPlayers = await db.prepare(
        'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
      ).bind(existingRoom.id).first();
      
      if (!connectedPlayers || connectedPlayers.count === 0) {
        // Room is stale — clean it up so the name can be reused
        console.log('[createRoom] Cleaning up stale room:', existingRoom.id);
        await db.batch([
          db.prepare('DELETE FROM players WHERE room_id = ?').bind(existingRoom.id),
          db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(existingRoom.id),
          db.prepare('DELETE FROM rooms WHERE id = ?').bind(existingRoom.id)
        ]);
        console.log('[createRoom] Stale room cleaned up, proceeding with creation');
      } else {
        console.log('[createRoom] Room already exists and has active players:', existingRoom);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room name already exists'
        }));
        return;
      }
    }
    
    // Create new room
    const roomId = generateRoomId();
    const timestamp = Date.now();
    console.log('[createRoom] Creating room:', { roomId, timestamp });
    
    try {
      await db.batch([
        db.prepare('INSERT INTO rooms (id, name, created_at, red_player_id) VALUES (?, ?, ?, ?)')
          .bind(roomId, roomName, timestamp, connectionId),
        db.prepare('INSERT INTO game_state (room_id, board, current_turn, updated_at) VALUES (?, ?, ?, ?)')
          .bind(roomId, JSON.stringify(initializeBoard()), 'red', timestamp),
        db.prepare('INSERT INTO players (id, room_id, color, connected, last_seen) VALUES (?, ?, ?, ?, ?)')
          .bind(connectionId, roomId, 'red', 1, timestamp)
      ]);
      console.log('[createRoom] Room created successfully in database');
    } catch (dbError) {
      console.error('[createRoom] Database error:', dbError);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Database error: ${dbError.message}`
      }));
      return;
    }
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = roomId;
      connection.playerId = connectionId;
      console.log('[createRoom] Connection updated:', { roomId, connectionId });
    } else {
      console.warn('[createRoom] Connection not found:', connectionId);
    }
    
    ws.send(JSON.stringify({
      type: 'roomCreated',
      roomId: roomId,
      color: 'red',
      roomName: roomName
    }));
    console.log('[createRoom] Room creation completed successfully');
  } catch (error) {
    console.error('[createRoom] Unexpected error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to create room: ${error.message}`
    }));
  }
}

async function joinRoom(ws, roomIdentifier, connectionId, db) {
  try {
    console.log('[joinRoom] Player joining:', { roomIdentifier, connectionId });
    
    // Find room by ID or name
    let room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ? OR name = ?'
    ).bind(roomIdentifier, roomIdentifier).first();
    
    if (!room) {
      console.log('[joinRoom] Room not found');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }
    
    // Check if room is full
    if (room.black_player_id) {
      console.log('[joinRoom] Room is full');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room is full'
      }));
      return;
    }
    
    const timestamp = Date.now();
    console.log('[joinRoom] Adding black player to room:', room.id);
    
    // Update room with black player
    await db.batch([
      db.prepare('UPDATE rooms SET black_player_id = ?, status = ? WHERE id = ?')
        .bind(connectionId, 'playing', room.id),
      db.prepare('INSERT INTO players (id, room_id, color, connected, last_seen) VALUES (?, ?, ?, ?, ?)')
        .bind(connectionId, room.id, 'black', 1, timestamp)
    ]);
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = room.id;
      connection.playerId = connectionId;
      console.log('[joinRoom] Connection updated for black player');
    }
    
    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId: room.id,
      color: 'black',
      opponentName: room.name
    }));
    console.log('[joinRoom] Black player joined successfully');
    
    // Notify red player - look for connection by connectionId (not playerId)
    console.log('[joinRoom] Notifying red player:', room.red_player_id);
    const redConnection = connections.get(room.red_player_id);
    console.log('[joinRoom] Red connection found:', !!redConnection);
    
    if (redConnection && redConnection.ws) {
      console.log('[joinRoom] Sending playerJoined notification to red player');
      redConnection.ws.send(JSON.stringify({
        type: 'playerJoined',
        playerName: 'Player 2'
      }));
    } else {
      console.warn('[joinRoom] Could not find red player connection:', room.red_player_id);
      console.warn('[joinRoom] This might be due to multiple server instances. Frontend should poll for updates.');
    }
    
    // Also try to broadcast to all connections in the room as fallback
    console.log('[joinRoom] Broadcasting to all connections in room as fallback');
    broadcastToRoom(room.id, {
      type: 'playerJoined',
      playerName: 'Player 2'
    }, db, connectionId);
    
  } catch (error) {
    console.error('[joinRoom] Error joining room:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to join room'
    }));
  }
}

async function handleMove(ws, data, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    let roomId = connection ? connection.roomId : null;
    
    // Fallback: use roomId from the message if the in-memory connection doesn't have it
    // This happens in stateless serverless environments where the move message
    // may be handled by a different instance than the one that created/joined the room
    if (!roomId && data.roomId) {
      roomId = data.roomId;
      // Re-associate this connection with the room for future messages on this instance
      if (connection) {
        connection.roomId = roomId;
        connection.playerId = connectionId;
      }
    }
    
    if (!roomId) {
      console.error('[handleMove] No roomId available:', connectionId);
      ws.send(JSON.stringify({
        type: 'moveRejected',
        from: data.from,
        to: data.to,
        message: 'Not in a room'
      }));
      return;
    }
    const timestamp = Date.now();
    
    // Get current game state and room info
    const gameState = await db.prepare(
      'SELECT board, current_turn FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) {
      ws.send(JSON.stringify({
        type: 'moveRejected',
        from: data.from,
        to: data.to,
        message: 'Game state not found'
      }));
      return;
    }
    
    // Validate turn
    const board = JSON.parse(gameState.board);
    const piece = board[data.from.row][data.from.col];
    
    if (!piece || piece.color !== gameState.current_turn) {
      ws.send(JSON.stringify({
        type: 'moveRejected',
        from: data.from,
        to: data.to,
        message: 'Not your turn'
      }));
      return;
    }
    
    // Make the move
    const capturedPiece = board[data.to.row][data.to.col];
    board[data.to.row][data.to.col] = board[data.from.row][data.from.col];
    board[data.from.row][data.from.col] = null;
    
    const newTurn = gameState.current_turn === 'red' ? 'black' : 'red';
    
    // Increment move number for polling detection
    const moveRecord = JSON.stringify({
      from: data.from,
      to: data.to,
      movedAt: timestamp
    });
    
    // Update database
    await db.prepare(
      'UPDATE game_state SET board = ?, current_turn = ?, last_move = ?, updated_at = ? WHERE room_id = ?'
    ).bind(
      JSON.stringify(board),
      newTurn,
      moveRecord,
      timestamp,
      roomId
    ).run();
    
    // Update player last seen
    await db.prepare(
      'UPDATE players SET last_seen = ? WHERE id = ?'
    ).bind(timestamp, connectionId).run();
    
    // Confirm move to the sender
    ws.send(JSON.stringify({
      type: 'moveConfirmed',
      from: data.from,
      to: data.to
    }));
    
    // Broadcast move to all other connections in the same room (same instance)
    broadcastToRoom(roomId, {
      type: 'move',
      from: data.from,
      to: data.to
    }, db, connectionId);
    
    // Check for checkmate
    if (capturedPiece && capturedPiece.type === 'jiang') {
      await db.prepare('UPDATE rooms SET status = ? WHERE id = ?')
        .bind('finished', roomId).run();
      
      broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: gameState.current_turn
      }, db);
    }
  } catch (error) {
    console.error('Error handling move:', error);
    ws.send(JSON.stringify({
      type: 'moveRejected',
      from: data.from,
      to: data.to,
      message: 'Failed to process move'
    }));
  }
}

async function leaveRoom(ws, roomId, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    if (!connection) return;
    
    const actualRoomId = roomId || connection.roomId;
    if (!actualRoomId) return;
    
    // Update player connection status
    await db.prepare(
      'UPDATE players SET connected = 0, last_seen = ? WHERE id = ?'
    ).bind(Date.now(), connectionId).run();
    
    // Notify opponent
    broadcastToRoom(actualRoomId, {
      type: 'playerLeft'
    }, db, connectionId);
    
    // Remove connection
    connections.delete(connectionId);
    
    // Check if the room should be cleaned up
    await cleanupRoomIfEmpty(actualRoomId, db);
  } catch (error) {
    console.error('Error leaving room:', error);
  }
}

async function cleanupRoomIfEmpty(roomId, db) {
  try {
    if (!roomId || !db) return;
    
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(roomId).first();
    
    if (!room) return;
    
    // Check if any players are still connected in this room
    const connectedPlayers = await db.prepare(
      'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
    ).bind(roomId).first();
    
    if (connectedPlayers && connectedPlayers.count > 0) {
      // At least one player is still connected, don't clean up
      return;
    }
    
    // No connected players — delete the room and all associated data
    console.log('[cleanupRoom] Cleaning up empty room:', roomId);
    await db.batch([
      db.prepare('DELETE FROM players WHERE room_id = ?').bind(roomId),
      db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(roomId),
      db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
    ]);
    console.log('[cleanupRoom] Room cleaned up successfully:', roomId);
  } catch (error) {
    console.error('[cleanupRoom] Error cleaning up room:', error);
  }
}

async function handleRejoin(ws, data, connectionId, db) {
  try {
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(data.roomId).first();
    
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = room.id;
      connection.playerId = connectionId;
    }
    
    // Update player status
    await db.prepare(
      'UPDATE players SET connected = 1, last_seen = ? WHERE id = ?'
    ).bind(Date.now(), connectionId).run();
    
    ws.send(JSON.stringify({
      type: 'rejoined',
      roomId: room.id,
      color: room.red_player_id === connectionId ? 'red' : 'black'
    }));
  } catch (error) {
    console.error('Error handling rejoin:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to rejoin'
    }));
  }
}

async function handleDisconnect(connectionId, db) {
  const connection = connections.get(connectionId);
  if (connection) {
    await leaveRoom(null, connection.roomId, connectionId, db);
  }
}

async function handleCheckOpponent(ws, roomId, connectionId, db) {
  try {
    console.log('[checkOpponent] Checking for opponent:', { roomId, connectionId });
    
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(roomId).first();
    
    if (!room) {
      console.log('[checkOpponent] Room not found');
      return;
    }
    
    // Determine which color the current connection is by checking the stored player ID
    // Since connectionId changes on reconnect, also check the players table
    let isRedPlayer = room.red_player_id === connectionId;
    let isBlackPlayer = room.black_player_id === connectionId;
    
    // If neither matches directly, check via the connection's stored info
    if (!isRedPlayer && !isBlackPlayer) {
      const connection = connections.get(connectionId);
      if (connection && connection.roomId === roomId) {
        // Fallback: assume creator (red) since they're the ones polling
        isRedPlayer = true;
      }
    }
    
    if (isRedPlayer && room.black_player_id) {
      // Red player is polling and black player has joined
      console.log('[checkOpponent] Opponent (black) found via DB:', room.black_player_id);
      ws.send(JSON.stringify({
        type: 'opponentFound',
        playerName: 'Player 2'
      }));
    } else if (isBlackPlayer && room.red_player_id) {
      // Black player is polling and red player exists
      console.log('[checkOpponent] Opponent (red) found via DB:', room.red_player_id);
      ws.send(JSON.stringify({
        type: 'opponentFound',
        playerName: 'Player 1'
      }));
    } else {
      console.log('[checkOpponent] No opponent yet');
    }
  } catch (error) {
    console.error('[checkOpponent] Error:', error);
  }
}

async function handleCheckMoves(ws, data, connectionId, db) {
  try {
    const roomId = data.roomId;
    const lastKnownUpdate = data.lastKnownUpdate || 0;
    
    if (!roomId) return;
    
    const gameState = await db.prepare(
      'SELECT current_turn, last_move, updated_at FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) return;
    
    // If the game state has been updated since the client last checked, send the latest move
    if (gameState.updated_at > lastKnownUpdate && gameState.last_move) {
      const lastMove = JSON.parse(gameState.last_move);
      ws.send(JSON.stringify({
        type: 'moveUpdate',
        from: lastMove.from,
        to: lastMove.to,
        currentTurn: gameState.current_turn,
        updatedAt: gameState.updated_at
      }));
    }
  } catch (error) {
    console.error('[handleCheckMoves] Error:', error);
  }
}

// Helper functions
function findConnectionByPlayerId(playerId) {
  for (const [id, conn] of connections.entries()) {
    if (conn.playerId === playerId) {
      return conn;
    }
  }
  return null;
}

function broadcastToRoom(roomId, message, db, excludeConnectionId) {
  for (const [id, conn] of connections.entries()) {
    if (conn.roomId === roomId && conn.ws && id !== excludeConnectionId) {
      conn.ws.send(JSON.stringify(message));
    }
  }
}

function generateConnectionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateRoomId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
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
