
const rooms = new Map();
const connections = new Map();

export default {
  async fetch(request, env, ctx) {
    return new Response('WebSocket endpoint');
  },

  async websocket(ws, env, ctx) {
    ws.accept();
    
    ws.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await handleMessage(ws, data, env);
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.addEventListener('close', async () => {
      await handleDisconnect(ws, env);
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }
};

async function handleMessage(ws, data, env) {
  const connectionId = getConnectionId(ws);
  
  switch (data.type) {
    case 'createRoom':
      await createRoom(ws, data.roomName, connectionId);
      break;
    case 'joinRoom':
      await joinRoom(ws, data.roomId, connectionId);
      break;
    case 'leaveRoom':
      await leaveRoom(ws, data.roomId, connectionId);
      break;
    case 'move':
      await broadcastMove(ws, data, connectionId);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

async function createRoom(ws, roomName, connectionId) {
  const roomId = generateRoomId();
  
  const room = {
    id: roomId,
    name: roomName,
    players: {
      red: connectionId,
      black: null
    },
    createdAt: Date.now()
  };
  
  rooms.set(roomId, room);
  connections.set(connectionId, { ws, roomId, color: 'red' });
  
  ws.send(JSON.stringify({
    type: 'roomCreated',
    roomId: roomId,
    color: 'red',
    roomName: roomName
  }));
}

async function joinRoom(ws, roomId, connectionId) {
  const room = rooms.get(roomId);
  
  if (!room) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room not found'
    }));
    return;
  }
  
  if (room.players.black) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room is full'
    }));
    return;
  }
  
  room.players.black = connectionId;
  connections.set(connectionId, { ws, roomId, color: 'black' });
  
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomId: roomId,
    color: 'black',
    opponentName: room.name
  }));
  
  const redPlayer = connections.get(room.players.red);
  if (redPlayer && redPlayer.ws) {
    redPlayer.ws.send(JSON.stringify({
      type: 'playerJoined',
      playerName: 'Player 2'
    }));
  }
}

async function leaveRoom(ws, roomId, connectionId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  if (room.players.red === connectionId) {
    room.players.red = null;
  } else if (room.players.black === connectionId) {
    room.players.black = null;
  }
  
  const opponentColor = room.players.red === connectionId ? 'black' : 'red';
  const opponentId = opponentColor === 'red' ? room.players.red : room.players.black;
  
  if (opponentId) {
    const opponent = connections.get(opponentId);
    if (opponent && opponent.ws) {
      opponent.ws.send(JSON.stringify({
        type: 'playerLeft'
      }));
    }
  }
  
  if (!room.players.red && !room.players.black) {
    rooms.delete(roomId);
  }
  
  connections.delete(connectionId);
}

async function broadcastMove(ws, data, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  const room = rooms.get(connection.roomId);
  if (!room) return;
  
  const opponentColor = connection.color === 'red' ? 'black' : 'red';
  const opponentId = opponentColor === 'red' ? room.players.red : room.players.black;
  
  if (opponentId) {
    const opponent = connections.get(opponentId);
    if (opponent && opponent.ws) {
      opponent.ws.send(JSON.stringify({
        type: 'move',
        from: data.from,
        to: data.to
      }));
    }
  }
}

async function handleDisconnect(ws, env) {
  const connectionId = getConnectionId(ws);
  const connection = connections.get(connectionId);
  
  if (connection) {
    await leaveRoom(ws, connection.roomId, connectionId);
  }
}

function getConnectionId(ws) {
  if (!ws._connectionId) {
    ws._connectionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  return ws._connectionId;
}

function generateRoomId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}
