
// Chinese Chess Backend - Cloudflare Pages Functions
// Comprehensive implementation with D1 database support

// ============================================
// Constants and Configuration
// ============================================

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds
const STALE_ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const ERROR_CODES = {
  // General errors
  UNKNOWN: { code: 1000, message: 'Unknown error' },
  INVALID_MESSAGE: { code: 1001, message: 'Invalid message format' },
  UNKNOWN_MESSAGE_TYPE: { code: 1002, message: 'Unknown message type' },
  
  // Database errors
  DATABASE_NOT_CONFIGURED: { code: 2000, message: 'Database not configured. Please check D1 binding.' },
  DATABASE_ERROR: { code: 2001, message: 'Database operation failed' },
  DATABASE_INIT_FAILED: { code: 2002, message: 'Database initialization failed' },
  
  // Room errors
  ROOM_NOT_FOUND: { code: 3000, message: 'Room not found' },
  ROOM_FULL: { code: 3001, message: 'Room is full' },
  ROOM_NAME_EXISTS: { code: 3002, message: 'Room name already exists' },
  ROOM_CREATION_FAILED: { code: 3003, message: 'Failed to create room' },
  
  // Game errors
  NOT_IN_ROOM: { code: 4000, message: 'Not in a room' },
  NOT_YOUR_TURN: { code: 4001, message: 'Not your turn' },
  INVALID_MOVE: { code: 4002, message: 'Invalid move' },
  GAME_OVER: { code: 4003, message: 'Game is over' },
  PIECE_NOT_FOUND: { code: 4004, message: 'Piece not found' },
  
  // Connection errors
  CONNECTION_FAILED: { code: 5000, message: 'Connection failed' },
  REJOIN_FAILED: { code: 5001, message: 'Failed to rejoin room' }
};

// ============================================
// Database Initialization
// ============================================

async function initializeDatabase(db) {
  try {
    console.log('[DB] Starting database initialization...');
    
    // Create tables using IF NOT EXISTS - idempotent and safe
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
        move_count INTEGER DEFAULT 0,
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
    
    console.log('[DB] Database initialized successfully');
    return true;
  } catch (error) {
    console.error('[DB] Initialization error:', error);
    return false;
  }
}

// ============================================
// Main Request Handler
// ============================================

export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Initialize database on every request (idempotent)
  if (context.env.DB) {
    const initSuccess = await initializeDatabase(context.env.DB);
    if (!initSuccess) {
      console.error('[Request] Database initialization failed');
    }
  }
  
  // Handle WebSocket upgrade
  if (url.pathname === '/ws') {
    return handleWebSocket(context);
  }
  
  // Serve static files
  return context.next();
}

// ============================================
// WebSocket Connection Management
// ============================================

// In-memory connections map (per instance)
const connections = new Map();

async function handleWebSocket(context) {
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  // Initialize database before accepting connection
  if (context.env.DB) {
    await initializeDatabase(context.env.DB);
  }

  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  
  const connectionId = generateConnectionId();
  const connectionData = {
    ws: server,
    roomId: null,
    playerId: null,
    color: null,
    lastHeartbeat: Date.now(),
    heartbeatTimer: null
  };
  
  connections.set(connectionId, connectionData);
  console.log(`[WS] Connection established: ${connectionId}`);
  
  // Setup heartbeat
  setupHeartbeat(server, connectionId);
  
  server.addEventListener('message', async (msg) => {
    try {
      const data = JSON.parse(msg.data);
      await handleMessage(server, data, connectionId, context.env);
    } catch (error) {
      console.error('[WS] Message handling error:', error);
      sendError(server, ERROR_CODES.INVALID_MESSAGE, error.message);
    }
  });

  server.addEventListener('close', async () => {
    console.log(`[WS] Connection closed: ${connectionId}`);
    await handleDisconnect(connectionId, context.env);
  });

  server.addEventListener('error', (error) => {
    console.error(`[WS] Connection error: ${connectionId}`, error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

// ============================================
// Heartbeat Management
// ============================================

function setupHeartbeat(ws, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  // Clear existing timer if any
  if (connection.heartbeatTimer) {
    clearInterval(connection.heartbeatTimer);
  }
  
  // Setup periodic heartbeat check
  connection.heartbeatTimer = setInterval(() => {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - connection.lastHeartbeat;
    
    if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[WS] Connection timeout: ${connectionId}`);
      ws.close(1001, 'Connection timeout');
      return;
    }
    
    // Send ping
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch (error) {
      console.error(`[WS] Failed to send ping: ${connectionId}`, error);
    }
  }, HEARTBEAT_INTERVAL);
}

function updateHeartbeat(connectionId) {
  const connection = connections.get(connectionId);
  if (connection) {
    connection.lastHeartbeat = Date.now();
  }
}

// ============================================
// Message Handler
// ============================================

async function handleMessage(ws, data, connectionId, env) {
  const db = env.DB;
  
  // Update heartbeat on any message
  updateHeartbeat(connectionId);
  
  // Handle pong response
  if (data.type === 'pong') {
    return;
  }
  
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
    case 'getGameState':
      await handleGetGameState(ws, data.roomId, connectionId, db);
      break;
    case 'resign':
      await handleResign(ws, data.roomId, connectionId, db);
      break;
    default:
      sendError(ws, ERROR_CODES.UNKNOWN_MESSAGE_TYPE);
  }
}

// ============================================
// Room Management
// ============================================

async function createRoom(ws, roomName, connectionId, db) {
  try {
    console.log('[Room] Creating room:', { roomName, connectionId });
    
    if (!db) {
      sendError(ws, ERROR_CODES.DATABASE_NOT_CONFIGURED);
      return;
    }
    
    // Validate room name
    if (!roomName || roomName.trim().length === 0) {
      sendError(ws, ERROR_CODES.ROOM_CREATION_FAILED, 'Room name cannot be empty');
      return;
    }
    
    roomName = roomName.trim().substring(0, 20); // Limit length
    
    // Check for existing room
    const existingRoom = await db.prepare(
      'SELECT id FROM rooms WHERE name = ?'
    ).bind(roomName).first();
    
    if (existingRoom) {
      // Check if room is stale
      const isStale = await checkRoomStale(existingRoom.id, db);
      
      if (isStale) {
        console.log('[Room] Cleaning up stale room:', existingRoom.id);
        await cleanupRoom(existingRoom.id, db);
      } else {
        sendError(ws, ERROR_CODES.ROOM_NAME_EXISTS);
        return;
      }
    }
    
    // Create new room
    const roomId = generateRoomId();
    const timestamp = Date.now();
    const initialBoard = initializeBoard();
    
    await db.batch([
      db.prepare('INSERT INTO rooms (id, name, created_at, red_player_id, status) VALUES (?, ?, ?, ?, ?)')
        .bind(roomId, roomName, timestamp, connectionId, 'waiting'),
      db.prepare('INSERT INTO game_state (room_id, board, current_turn, move_count, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(roomId, JSON.stringify(initialBoard), 'red', 0, timestamp),
      db.prepare('INSERT INTO players (id, room_id, color, connected, last_seen) VALUES (?, ?, ?, ?, ?)')
        .bind(connectionId, roomId, 'red', 1, timestamp)
    ]);
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = roomId;
      connection.playerId = connectionId;
      connection.color = 'red';
    }
    
    ws.send(JSON.stringify({
      type: 'roomCreated',
      roomId: roomId,
      color: 'red',
      roomName: roomName
    }));
    
    console.log('[Room] Room created successfully:', roomId);
  } catch (error) {
    console.error('[Room] Creation error:', error);
    sendError(ws, ERROR_CODES.ROOM_CREATION_FAILED, error.message);
  }
}

async function joinRoom(ws, roomIdentifier, connectionId, db) {
  try {
    console.log('[Room] Joining room:', { roomIdentifier, connectionId });
    
    // Find room by ID or name
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ? OR name = ?'
    ).bind(roomIdentifier, roomIdentifier).first();
    
    if (!room) {
      sendError(ws, ERROR_CODES.ROOM_NOT_FOUND);
      return;
    }
    
    // Check if room is full
    if (room.black_player_id) {
      sendError(ws, ERROR_CODES.ROOM_FULL);
      return;
    }
    
    // Check if room status is valid
    if (room.status === 'finished') {
      sendError(ws, ERROR_CODES.GAME_OVER);
      return;
    }
    
    const timestamp = Date.now();
    
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
      connection.color = 'black';
    }
    
    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId: room.id,
      color: 'black',
      opponentName: room.name
    }));
    
    // Notify red player
    const redConnection = connections.get(room.red_player_id);
    if (redConnection && redConnection.ws) {
      redConnection.ws.send(JSON.stringify({
        type: 'playerJoined',
        playerName: 'Player 2',
        color: 'black'
      }));
    }
    
    // Broadcast as fallback
    broadcastToRoom(room.id, {
      type: 'playerJoined',
      playerName: 'Player 2',
      color: 'black'
    }, connectionId);
    
    console.log('[Room] Player joined successfully:', room.id);
  } catch (error) {
    console.error('[Room] Join error:', error);
    sendError(ws, ERROR_CODES.DATABASE_ERROR, error.message);
  }
}

async function leaveRoom(ws, roomId, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    const actualRoomId = roomId || connection?.roomId;
    
    if (!actualRoomId) return;
    
    // Update player status
    await db.prepare(
      'UPDATE players SET connected = 0, last_seen = ? WHERE id = ?'
    ).bind(Date.now(), connectionId).run();
    
    // Notify opponent
    broadcastToRoom(actualRoomId, {
      type: 'playerLeft',
      playerId: connectionId
    }, connectionId);
    
    // Clear connection info
    if (connection) {
      connection.roomId = null;
      connection.playerId = null;
      connection.color = null;
    }
    
    // Cleanup if empty
    await cleanupRoomIfEmpty(actualRoomId, db);
    
    ws.send(JSON.stringify({ type: 'leftRoom' }));
  } catch (error) {
    console.error('[Room] Leave error:', error);
  }
}

async function checkRoomStale(roomId, db) {
  const now = Date.now();
  
  const connectedPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
  ).bind(roomId).first();
  
  const recentPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND last_seen > ?'
  ).bind(roomId, now - STALE_ROOM_TIMEOUT).first();
  
  const totalPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ?'
  ).bind(roomId).first();
  
  return (!totalPlayers || totalPlayers.count === 0) ||
         (!connectedPlayers || connectedPlayers.count === 0) ||
         (!recentPlayers || recentPlayers.count === 0);
}

async function cleanupRoom(roomId, db) {
  await db.batch([
    db.prepare('DELETE FROM players WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
  ]);
}

async function cleanupRoomIfEmpty(roomId, db) {
  const connectedPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
  ).bind(roomId).first();
  
  if (!connectedPlayers || connectedPlayers.count === 0) {
    console.log('[Room] Cleaning up empty room:', roomId);
    await cleanupRoom(roomId, db);
  }
}

// ============================================
// Game Logic
// ============================================

async function handleMove(ws, data, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    let roomId = connection?.roomId || data.roomId;
    
    if (!roomId) {
      sendError(ws, ERROR_CODES.NOT_IN_ROOM);
      return;
    }
    
    // Get current game state
    const gameState = await db.prepare(
      'SELECT board, current_turn, move_count, status FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) {
      sendError(ws, ERROR_CODES.ROOM_NOT_FOUND);
      return;
    }
    
    if (gameState.status === 'finished') {
      sendError(ws, ERROR_CODES.GAME_OVER);
      return;
    }
    
    // Validate turn
    const board = JSON.parse(gameState.board);
    const piece = board[data.from.row]?.[data.from.col];
    
    if (!piece) {
      sendError(ws, ERROR_CODES.PIECE_NOT_FOUND);
      return;
    }
    
    // Get player color from database
    const player = await db.prepare(
      'SELECT color FROM players WHERE id = ? AND room_id = ?'
    ).bind(connectionId, roomId).first();
    
    const playerColor = player?.color || connection?.color;
    
    if (!playerColor || piece.color !== playerColor) {
      sendError(ws, ERROR_CODES.NOT_YOUR_TURN);
      return;
    }
    
    if (gameState.current_turn !== piece.color) {
      sendError(ws, ERROR_CODES.NOT_YOUR_TURN);
      return;
    }
    
    // Validate move
    const validMoves = getValidMoves(data.from.row, data.from.col, piece, board);
    const isValidMove = validMoves.some(m => m.row === data.to.row && m.col === data.to.col);
    
    if (!isValidMove) {
      sendError(ws, ERROR_CODES.INVALID_MOVE);
      return;
    }
    
    // Execute move
    const capturedPiece = board[data.to.row][data.to.col];
    board[data.to.row][data.to.col] = piece;
    board[data.from.row][data.from.col] = null;
    
    const newTurn = gameState.current_turn === 'red' ? 'black' : 'red';
    const moveCount = (gameState.move_count || 0) + 1;
    const timestamp = Date.now();
    
    // Check for check/checkmate
    const isInCheck = isKingInCheck(board, newTurn);
    const isCheckmate = isInCheck && isCheckmateState(board, newTurn);
    
    // Check for game over (king captured)
    let gameStatus = 'playing';
    let winner = null;
    
    if (capturedPiece && capturedPiece.type === 'jiang') {
      gameStatus = 'finished';
      winner = piece.color;
    } else if (isCheckmate) {
      gameStatus = 'finished';
      winner = piece.color;
    }
    
    const moveRecord = JSON.stringify({
      from: data.from,
      to: data.to,
      piece: piece,
      captured: capturedPiece,
      timestamp: timestamp,
      moveNumber: moveCount
    });
    
    // Update database
    await db.batch([
      db.prepare('UPDATE game_state SET board = ?, current_turn = ?, last_move = ?, move_count = ?, updated_at = ? WHERE room_id = ?')
        .bind(JSON.stringify(board), newTurn, moveRecord, moveCount, timestamp, roomId),
      db.prepare('UPDATE players SET last_seen = ? WHERE id = ?')
        .bind(timestamp, connectionId)
    ]);
    
    if (gameStatus === 'finished') {
      await db.prepare('UPDATE rooms SET status = ? WHERE id = ?')
        .bind('finished', roomId).run();
    }
    
    // Confirm move
    ws.send(JSON.stringify({
      type: 'moveConfirmed',
      from: data.from,
      to: data.to,
      moveNumber: moveCount
    }));
    
    // Broadcast move
    broadcastToRoom(roomId, {
      type: 'move',
      from: data.from,
      to: data.to,
      piece: piece,
      captured: capturedPiece,
      currentTurn: newTurn,
      isInCheck: isInCheck,
      isCheckmate: isCheckmate
    }, connectionId);
    
    // Broadcast game over
    if (gameStatus === 'finished') {
      broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: winner,
        reason: capturedPiece?.type === 'jiang' ? 'capture' : 'checkmate'
      });
    }
    
  } catch (error) {
    console.error('[Game] Move error:', error);
    ws.send(JSON.stringify({
      type: 'moveRejected',
      from: data.from,
      to: data.to,
      error: error.message
    }));
  }
}

async function handleGetGameState(ws, roomId, connectionId, db) {
  try {
    const gameState = await db.prepare(
      'SELECT board, current_turn, move_count, last_move FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) {
      sendError(ws, ERROR_CODES.ROOM_NOT_FOUND);
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'gameState',
      board: JSON.parse(gameState.board),
      currentTurn: gameState.current_turn,
      moveCount: gameState.move_count,
      lastMove: gameState.last_move ? JSON.parse(gameState.last_move) : null
    }));
  } catch (error) {
    console.error('[Game] Get state error:', error);
    sendError(ws, ERROR_CODES.DATABASE_ERROR, error.message);
  }
}

async function handleResign(ws, roomId, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    const actualRoomId = roomId || connection?.roomId;
    
    if (!actualRoomId) {
      sendError(ws, ERROR_CODES.NOT_IN_ROOM);
      return;
    }
    
    const player = await db.prepare(
      'SELECT color FROM players WHERE id = ? AND room_id = ?'
    ).bind(connectionId, actualRoomId).first();
    
    if (!player) {
      sendError(ws, ERROR_CODES.NOT_IN_ROOM);
      return;
    }
    
    const winner = player.color === 'red' ? 'black' : 'red';
    
    await db.batch([
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?')
        .bind('finished', actualRoomId),
      db.prepare('UPDATE players SET connected = 0 WHERE id = ?')
        .bind(connectionId)
    ]);
    
    broadcastToRoom(actualRoomId, {
      type: 'gameOver',
      winner: winner,
      reason: 'resign',
      resignedBy: player.color
    });
    
    ws.send(JSON.stringify({ type: 'resigned' }));
  } catch (error) {
    console.error('[Game] Resign error:', error);
    sendError(ws, ERROR_CODES.DATABASE_ERROR, error.message);
  }
}

// ============================================
// Chess Rules Implementation
// ============================================

function getValidMoves(row, col, piece, board) {
  const moves = [];
  
  switch (piece.type) {
    case 'jiang':
      moves.push(...getJiangMoves(row, col, piece, board));
      break;
    case 'shi':
      moves.push(...getShiMoves(row, col, piece, board));
      break;
    case 'xiang':
      moves.push(...getXiangMoves(row, col, piece, board));
      break;
    case 'ma':
      moves.push(...getMaMoves(row, col, piece, board));
      break;
    case 'ju':
      moves.push(...getJuMoves(row, col, piece, board));
      break;
    case 'pao':
      moves.push(...getPaoMoves(row, col, piece, board));
      break;
    case 'zu':
      moves.push(...getZuMoves(row, col, piece, board));
      break;
  }
  
  // Filter moves that would leave own king in check
  return moves.filter(move => {
    const testBoard = JSON.parse(JSON.stringify(board));
    testBoard[move.row][move.col] = testBoard[row][col];
    testBoard[row][col] = null;
    return !isKingInCheck(testBoard, piece.color);
  });
}

function getJiangMoves(row, col, piece, board) {
  const moves = [];
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  
  // Palace boundaries
  const minRow = piece.color === 'red' ? 7 : 0;
  const maxRow = piece.color === 'red' ? 9 : 2;
  const minCol = 3;
  const maxCol = 5;
  
  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    
    if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
      const target = board[newRow][newCol];
      if (!target || target.color !== piece.color) {
        moves.push({ row: newRow, col: newCol });
      }
    }
  }
  
  // Flying general (face-to-face capture)
  const opponentKingRow = findKing(board, piece.color === 'red' ? 'black' : 'red');
  if (opponentKingRow && opponentKingRow.col === col) {
    let blocked = false;
    const startRow = Math.min(row, opponentKingRow.row) + 1;
    const endRow = Math.max(row, opponentKingRow.row);
    
    for (let r = startRow; r < endRow; r++) {
      if (board[r][col]) {
        blocked = true;
        break;
      }
    }
    
    if (!blocked) {
      moves.push({ row: opponentKingRow.row, col: opponentKingRow.col });
    }
  }
  
  return moves;
}

function getShiMoves(row, col, piece, board) {
  const moves = [];
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  
  const minRow = piece.color === 'red' ? 7 : 0;
  const maxRow = piece.color === 'red' ? 9 : 2;
  const minCol = 3;
  const maxCol = 5;
  
  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    
    if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
      const target = board[newRow][newCol];
      if (!target || target.color !== piece.color) {
        moves.push({ row: newRow, col: newCol });
      }
    }
  }
  
  return moves;
}

function getXiangMoves(row, col, piece, board) {
  const moves = [];
  const directions = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
  const blocks = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  
  // River boundary
  const minRow = piece.color === 'red' ? 5 : 0;
  const maxRow = piece.color === 'red' ? 9 : 4;
  
  for (let i = 0; i < directions.length; i++) {
    const [dr, dc] = directions[i];
    const [br, bc] = blocks[i];
    const newRow = row + dr;
    const newCol = col + dc;
    const blockRow = row + br;
    const blockCol = col + bc;
    
    if (newRow >= minRow && newRow <= maxRow && newCol >= 0 && newCol <= 8) {
      // Check if blocked
      if (!board[blockRow][blockCol]) {
        const target = board[newRow][newCol];
        if (!target || target.color !== piece.color) {
          moves.push({ row: newRow, col: newCol });
        }
      }
    }
  }
  
  return moves;
}

function getMaMoves(row, col, piece, board) {
  const moves = [];
  const jumps = [
    { block: [0, 1], move: [-1, 2] },
    { block: [0, 1], move: [1, 2] },
    { block: [0, -1], move: [-1, -2] },
    { block: [0, -1], move: [1, -2] },
    { block: [1, 0], move: [2, 1] },
    { block: [1, 0], move: [2, -1] },
    { block: [-1, 0], move: [-2, 1] },
    { block: [-1, 0], move: [-2, -1] }
  ];
  
  for (const jump of jumps) {
    const blockRow = row + jump.block[0];
    const blockCol = col + jump.block[1];
    const newRow = row + jump.move[0];
    const newCol = col + jump.move[1];
    
    if (newRow >= 0 && newRow <= 9 && newCol >= 0 && newCol <= 8) {
      // Check if blocked (蹩马腿)
      if (blockRow >= 0 && blockRow <= 9 && blockCol >= 0 && blockCol <= 8) {
        if (!board[blockRow][blockCol]) {
          const target = board[newRow][newCol];
          if (!target || target.color !== piece.color) {
            moves.push({ row: newRow, col: newCol });
          }
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

function getPaoMoves(row, col, piece, board) {
  const moves = [];
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  
  for (const [dr, dc] of directions) {
    let newRow = row + dr;
    let newCol = col + dc;
    let jumped = false;
    
    while (newRow >= 0 && newRow <= 9 && newCol >= 0 && newCol <= 8) {
      const target = board[newRow][newCol];
      
      if (!jumped) {
        if (!target) {
          moves.push({ row: newRow, col: newCol });
        } else {
          jumped = true;
        }
      } else {
        if (target) {
          if (target.color !== piece.color) {
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

function getZuMoves(row, col, piece, board) {
  const moves = [];
  
  // Forward direction
  const forward = piece.color === 'red' ? -1 : 1;
  
  // Check if crossed river
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

function findKing(board, color) {
  for (let row = 0; row <= 9; row++) {
    for (let col = 0; col <= 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'jiang' && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  
  // Check if any opponent piece can capture the king
  const opponentColor = color === 'red' ? 'black' : 'red';
  
  for (let row = 0; row <= 9; row++) {
    for (let col = 0; col <= 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === opponentColor) {
        const moves = getValidMovesWithoutCheckFilter(row, col, piece, board);
        if (moves.some(m => m.row === king.row && m.col === king.col)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function getValidMovesWithoutCheckFilter(row, col, piece, board) {
  switch (piece.type) {
    case 'jiang': return getJiangMoves(row, col, piece, board);
    case 'shi': return getShiMoves(row, col, piece, board);
    case 'xiang': return getXiangMoves(row, col, piece, board);
    case 'ma': return getMaMoves(row, col, piece, board);
    case 'ju': return getJuMoves(row, col, piece, board);
    case 'pao': return getPaoMoves(row, col, piece, board);
    case 'zu': return getZuMoves(row, col, piece, board);
    default: return [];
  }
}

function isCheckmateState(board, color) {
  // Check if any piece of the given color has valid moves
  for (let row = 0; row <= 9; row++) {
    for (let col = 0; col <= 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        const moves = getValidMoves(row, col, piece, board);
        if (moves.length > 0) {
          return false;
        }
      }
    }
  }
  return true;
}

// ============================================
// Utility Functions
// ============================================

async function handleRejoin(ws, data, connectionId, db) {
  try {
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(data.roomId).first();
    
    if (!room) {
      sendError(ws, ERROR_CODES.ROOM_NOT_FOUND);
      return;
    }
    
    // Check if this player was in the room
    const player = await db.prepare(
      'SELECT * FROM players WHERE room_id = ? AND color = ?'
    ).bind(data.roomId, data.color).first();
    
    if (!player) {
      sendError(ws, ERROR_CODES.REJOIN_FAILED, 'Player not found in room');
      return;
    }
    
    // Update player connection
    await db.batch([
      db.prepare('UPDATE players SET id = ?, connected = 1, last_seen = ? WHERE room_id = ? AND color = ?')
        .bind(connectionId, Date.now(), data.roomId, data.color),
      db.prepare(`UPDATE rooms SET ${data.color}_player_id = ? WHERE id = ?`)
        .bind(connectionId, data.roomId)
    ]);
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = room.id;
      connection.playerId = connectionId;
      connection.color = data.color;
    }
    
    // Get current game state
    const gameState = await db.prepare(
      'SELECT board, current_turn, move_count FROM game_state WHERE room_id = ?'
    ).bind(data.roomId).first();
    
    ws.send(JSON.stringify({
      type: 'rejoined',
      roomId: room.id,
      color: data.color,
      board: JSON.parse(gameState.board),
      currentTurn: gameState.current_turn,
      moveCount: gameState.move_count
    }));
  } catch (error) {
    console.error('[Room] Rejoin error:', error);
    sendError(ws, ERROR_CODES.REJOIN_FAILED, error.message);
  }
}

async function handleCheckOpponent(ws, roomId, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    const actualRoomId = roomId || connection?.roomId;
    
    if (!actualRoomId) return;
    
    const room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(actualRoomId).first();
    
    if (!room) return;
    
    const player = await db.prepare(
      'SELECT color FROM players WHERE id = ? AND room_id = ?'
    ).bind(connectionId, actualRoomId).first();
    
    const myColor = player?.color || connection?.color;
    
    if (myColor === 'red' && room.black_player_id) {
      ws.send(JSON.stringify({
        type: 'opponentFound',
        playerName: 'Player 2',
        color: 'black'
      }));
    } else if (myColor === 'black' && room.red_player_id) {
      ws.send(JSON.stringify({
        type: 'opponentFound',
        playerName: 'Player 1',
        color: 'red'
      }));
    }
  } catch (error) {
    console.error('[Room] Check opponent error:', error);
  }
}

async function handleCheckMoves(ws, data, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    const roomId = data.roomId || connection?.roomId;
    
    if (!roomId) return;
    
    const gameState = await db.prepare(
      'SELECT current_turn, last_move, updated_at FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) return;
    
    if (gameState.updated_at > (data.lastKnownUpdate || 0) && gameState.last_move) {
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
    console.error('[Game] Check moves error:', error);
  }
}

async function handleDisconnect(connectionId, env) {
  const connection = connections.get(connectionId);
  
  if (connection) {
    // Clear heartbeat timer
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }
    
    // Update player status
    if (connection.roomId && env.DB) {
      await env.DB.prepare(
        'UPDATE players SET connected = 0, last_seen = ? WHERE id = ?'
      ).bind(Date.now(), connectionId).run();
      
      // Notify opponent
      broadcastToRoom(connection.roomId, {
        type: 'opponentDisconnected',
        playerId: connectionId
      }, connectionId);
      
      // Schedule cleanup
      setTimeout(() => cleanupRoomIfEmpty(connection.roomId, env.DB), 60000);
    }
    
    connections.delete(connectionId);
  }
}

function broadcastToRoom(roomId, message, excludeConnectionId = null) {
  for (const [id, conn] of connections.entries()) {
    if (conn.roomId === roomId && conn.ws && id !== excludeConnectionId) {
      try {
        conn.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WS] Broadcast error to ${id}:`, error);
      }
    }
  }
}

function sendError(ws, errorInfo, details = null) {
  ws.send(JSON.stringify({
    type: 'error',
    code: errorInfo.code,
    message: errorInfo.message,
    details: details
  }));
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
