
export async function onRequest(context) {
  const url = new URL(context.request.url);
  
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
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

async function createRoom(ws, roomName, connectionId, db) {
  try {
    // Check if room name already exists
    const existingRoom = await db.prepare(
      'SELECT id FROM rooms WHERE name = ?'
    ).bind(roomName).first();
    
    if (existingRoom) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room name already exists'
      }));
      return;
    }
    
    // Create new room
    const roomId = generateRoomId();
    const timestamp = Date.now();
    
    await db.batch([
      db.prepare('INSERT INTO rooms (id, name, created_at, red_player_id) VALUES (?, ?, ?, ?)')
        .bind(roomId, roomName, timestamp, connectionId),
      db.prepare('INSERT INTO game_state (room_id, board, current_turn, updated_at) VALUES (?, ?, ?, ?)')
        .bind(roomId, JSON.stringify(initializeBoard()), 'red', timestamp),
      db.prepare('INSERT INTO players (id, room_id, color, connected, last_seen) VALUES (?, ?, ?, ?, ?)')
        .bind(connectionId, roomId, 'red', 1, timestamp)
    ]);
    
    // Update connection info
    const connection = connections.get(connectionId);
    if (connection) {
      connection.roomId = roomId;
      connection.playerId = connectionId;
    }
    
    ws.send(JSON.stringify({
      type: 'roomCreated',
      roomId: roomId,
      color: 'red',
      roomName: roomName
    }));
  } catch (error) {
    console.error('Error creating room:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create room'
    }));
  }
}

async function joinRoom(ws, roomIdentifier, connectionId, db) {
  try {
    // Find room by ID or name
    let room = await db.prepare(
      'SELECT * FROM rooms WHERE id = ? OR name = ?'
    ).bind(roomIdentifier, roomIdentifier).first();
    
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room not found'
      }));
      return;
    }
    
    // Check if room is full
    if (room.black_player_id) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room is full'
      }));
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
    }
    
    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId: room.id,
      color: 'black',
      opponentName: room.name
    }));
    
    // Notify red player
    const redConnection = findConnectionByPlayerId(room.red_player_id);
    if (redConnection && redConnection.ws) {
      redConnection.ws.send(JSON.stringify({
        type: 'playerJoined',
        playerName: 'Player 2'
      }));
    }
  } catch (error) {
    console.error('Error joining room:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to join room'
    }));
  }
}

async function handleMove(ws, data, connectionId, db) {
  try {
    const connection = connections.get(connectionId);
    if (!connection || !connection.roomId) return;
    
    const roomId = connection.roomId;
    const timestamp = Date.now();
    
    // Get current game state
    const gameState = await db.prepare(
      'SELECT board, current_turn FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();
    
    if (!gameState) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Game state not found'
      }));
      return;
    }
    
    // Validate turn
    const board = JSON.parse(gameState.board);
    const piece = board[data.from.row][data.from.col];
    
    if (!piece || piece.color !== gameState.current_turn) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Not your turn'
      }));
      return;
    }
    
    // Make the move
    const capturedPiece = board[data.to.row][data.to.col];
    board[data.to.row][data.to.col] = board[data.from.row][data.from.col];
    board[data.from.row][data.from.col] = null;
    
    const newTurn = gameState.current_turn === 'red' ? 'black' : 'red';
    
    // Update database
    await db.prepare(
      'UPDATE game_state SET board = ?, current_turn = ?, last_move = ?, updated_at = ? WHERE room_id = ?'
    ).bind(
      JSON.stringify(board),
      newTurn,
      JSON.stringify(data),
      timestamp,
      roomId
    ).run();
    
    // Update player last seen
    await db.prepare(
      'UPDATE players SET last_seen = ? WHERE id = ?'
    ).bind(timestamp, connectionId).run();
    
    // Find opponent and broadcast
    const opponentConnection = findOpponentConnection(roomId, gameState.current_turn);
    if (opponentConnection && opponentConnection.ws) {
      opponentConnection.ws.send(JSON.stringify({
        type: 'move',
        from: data.from,
        to: data.to
      }));
    }
    
    ws.send(JSON.stringify({
      type: 'moveConfirmed',
      from: data.from,
      to: data.to
    }));
    
    // Check for checkmate
    if (capturedPiece && capturedPiece.type === 'jiang') {
      await db.prepare('UPDATE rooms SET status = ? WHERE id = ?')
        .bind('finished', roomId).run();
      
      // Broadcast game over
      broadcastToRoom(roomId, {
        type: 'gameOver',
        winner: gameState.current_turn
      }, db);
    }
  } catch (error) {
    console.error('Error handling move:', error);
    ws.send(JSON.stringify({
      type: 'error',
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
  } catch (error) {
    console.error('Error leaving room:', error);
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
      .bind(Date.now(), connectionId)
    ).run();
    
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

// Helper functions
function findConnectionByPlayerId(playerId) {
  for (const [id, conn] of connections.entries()) {
    if (conn.playerId === playerId) {
      return conn;
    }
  }
  return null;
}

function findOpponentConnection(roomId, currentTurn) {
  for (const [id, conn] of connections.entries()) {
    if (conn.roomId === roomId) {
      const playerColor = conn.playerId === conn.roomId ? 'red' : 'black';
      if (playerColor !== currentTurn) {
        return conn;
      }
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
