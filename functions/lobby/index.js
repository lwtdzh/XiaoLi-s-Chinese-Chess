
// Durable Object for managing the lobby (room list)
export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map();
    
    this.state.blockConcurrencyWhile(async () => {
      const storedRooms = await this.state.storage.get('rooms');
      if (storedRooms) {
        this.rooms = new Map(JSON.parse(storedRooms));
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/create') {
      return this.createRoom(request);
    } else if (path === '/get') {
      return this.getRoom(request);
    } else if (path === '/list') {
      return this.listRooms();
    } else if (path === '/exists') {
      return this.roomExists(request);
    }

    return new Response('Not found', { status: 404 });
  }

  async createRoom(request) {
    const { roomName } = await request.json();
    
    // Check if room name already exists
    for (const [id, room] of this.rooms.entries()) {
      if (room.name === roomName) {
        return new Response(JSON.stringify({ 
          error: 'Room name already exists' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Create new room Durable Object
    const roomId = this.generateRoomId();
    const roomStub = this.env.ROOM.get(this.env.ROOM.idFromName(roomId));
    
    this.rooms.set(roomId, {
      id: roomId,
      name: roomName,
      createdAt: Date.now()
    });
    
    await this.state.storage.put('rooms', JSON.stringify([...this.rooms.entries()]));
    
    return new Response(JSON.stringify({ 
      roomId: roomId,
      roomUrl: `/rooms/${roomId}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getRoom(request) {
    const url = new URL(request.url);
    const roomIdentifier = url.searchParams.get('id');
    
    // Try to find by ID or name
    let room = this.rooms.get(roomIdentifier);
    
    if (!room) {
      for (const [id, r] of this.rooms.entries()) {
        if (r.name === roomIdentifier) {
          room = r;
          break;
        }
      }
    }
    
    if (!room) {
      return new Response(JSON.stringify({ 
        error: 'Room not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      roomId: room.id,
      roomName: room.name,
      roomUrl: `/rooms/${room.id}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async roomExists(request) {
    const url = new URL(request.url);
    const roomIdentifier = url.searchParams.get('id');
    
    let exists = this.rooms.has(roomIdentifier);
    
    if (!exists) {
      for (const [id, room] of this.rooms.entries()) {
        if (room.name === roomIdentifier) {
          exists = true;
          break;
        }
      }
    }
    
    return new Response(JSON.stringify({ exists }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async listRooms() {
    const roomList = Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt
    }));
    
    return new Response(JSON.stringify({ rooms: roomList }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  generateRoomId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }
}

export default {
  async fetch(request, env, ctx) {
    return new Response('Lobby Durable Object', { status: 200 });
  }
};
