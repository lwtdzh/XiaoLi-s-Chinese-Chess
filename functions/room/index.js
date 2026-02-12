
// Durable Object for managing a single game room
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.state.blockConcurrencyWhile(async () => {
      // Initialize room state from storage
      const roomData = await this.state.storage.get('roomData');
      if (roomData) {
        this.roomData = roomData;
      } else {
        this.roomData = {
          id: '',
          name: '',
          players: { red: null, black: null },
          createdAt: Date.now()
        };
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/connect') {
      return this.connect(request);
    } else if (path === '/getState') {
      return this.getState();
    }

    return new Response('Not found', { status: 404 });
  }

  async connect(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    
    server.accept();
    
    const sessionId = this.generateSessionId();
    this.sessions.set(sessionId, { ws: server, playerId: null });

    server.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(sessionId, server, data);
      } catch (error) {
        console.error('Error handling message:', error);
        server.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    server.addEventListener('close', async () => {
      await this.disconnect(sessionId);
    });

    server.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleMessage(sessionId, ws, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (data.type) {
      case 'createRoom':
        await this.createRoom(ws, data.roomName, sessionId);
        break;
      case 'joinRoom':
        await this.joinRoom(ws, sessionId);
        break;
      case 'leaveRoom':
        await this.leaveRoom(sessionId);
        break;
      case 'move':
        await this.broadcastMove(sessionId, data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  async createRoom(ws, roomName, sessionId) {
    this.roomData = {
      id: this.state.id.toString(),
      name: roomName,
      players: { red: sessionId, black: null },
      createdAt: Date.now()
    };
    
    await this.state.storage.put('roomData', this.roomData);
    
    const session = this.sessions.get(sessionId);
    session.playerId = 'red';
    
    ws.send(JSON.stringify({
      type: 'roomCreated',
      roomId: this.roomData.id,
      color: 'red',
      roomName: roomName
    }));
  }

  async joinRoom(ws, sessionId) {
    if (this.roomData.players.black) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room is full'
      }));
      return;
    }
    
    this.roomData.players.black = sessionId;
    await this.state.storage.put('roomData', this.roomData);
    
    const session = this.sessions.get(sessionId);
    session.playerId = 'black';
    
    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId: this.roomData.id,
      color: 'black',
      opponentName: this.roomData.name
    }));
    
    // Notify red player
    const redSession = this.sessions.get(this.roomData.players.red);
    if (redSession && redSession.ws) {
      redSession.ws.send(JSON.stringify({
        type: 'playerJoined',
        playerName: 'Player 2'
      }));
    }
  }

  async leaveRoom(sessionId) {
    if (this.roomData.players.red === sessionId) {
      this.roomData.players.red = null;
    } else if (this.roomData.players.black === sessionId) {
      this.roomData.players.black = null;
    }
    
    await this.state.storage.put('roomData', this.roomData);
    
    const opponentId = this.roomData.players.red === sessionId ? 
      this.roomData.players.black : this.roomData.players.red;
    
    if (opponentId) {
      const opponent = this.sessions.get(opponentId);
      if (opponent && opponent.ws) {
        opponent.ws.send(JSON.stringify({
          type: 'playerLeft'
        }));
      }
    }
    
    this.sessions.delete(sessionId);
  }

  async broadcastMove(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const opponentId = session.playerId === 'red' ? 
      this.roomData.players.black : this.roomData.players.red;
    
    if (opponentId) {
      const opponent = this.sessions.get(opponentId);
      if (opponent && opponent.ws) {
        opponent.ws.send(JSON.stringify({
          type: 'move',
          from: data.from,
          to: data.to
        }));
      }
    }
  }

  async disconnect(sessionId) {
    await this.leaveRoom(sessionId);
  }

  async getState() {
    const response = {
      roomData: this.roomData,
      activeSessions: this.sessions.size
    };
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default {
  async fetch(request, env, ctx) {
    return new Response('Room Durable Object', { status: 200 });
  }
};
