// POST /api/rooms — 创建房间
/* eslint-disable camelcase, no-unused-vars */
/* eslint-env node, es2021 */

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

const STALE_ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Rate limiting for room creation
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 room creations per minute per IP

// Simple in-memory rate limiter (for production, consider using KV or D1)
const rateLimitStore = new Map();

function checkRateLimit(clientIp) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  let requests = rateLimitStore.get(clientIp) || [];
  
  // Filter out requests outside the time window
  requests = requests.filter(timestamp => timestamp > windowStart);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  // Add current request
  requests.push(now);
  rateLimitStore.set(clientIp, requests);
  
  return true;
}

async function checkRoomStale(roomId, db) {
  const now = Date.now();

  const totalPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ?'
  ).bind(roomId).first();

  if (!totalPlayers || totalPlayers.count === 0) {
    return true;
  }

  const connectedPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
  ).bind(roomId).first();

  const recentPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND last_seen > ?'
  ).bind(roomId, now - STALE_ROOM_TIMEOUT).first();

  // Stale if all players are disconnected AND all inactive beyond timeout
  return (!connectedPlayers || connectedPlayers.count === 0) &&
         (!recentPlayers || recentPlayers.count === 0);
}

async function cleanupRoom(roomId, db) {
  await db.batch([
    db.prepare('DELETE FROM players WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
  ]);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  try {
    // Check rate limit based on client IP
    const clientIp = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 
                    'unknown';
    
    if (!checkRateLimit(clientIp)) {
      return Response.json({ error: '创建房间过于频繁，请稍后重试' }, { status: 429 });
    }
    
    const body = await context.request.json();
    const roomName = (body.roomName || '').trim();
    
    // Validate and sanitize player name to prevent SQL injection
    let playerName = (body.playerName || 'Player').trim();
    
    // Validate player name length
    if (playerName.length > 50) {
      return Response.json({ error: '玩家名称过长（最多50字符）' }, { status: 400 });
    }
    
    // Validate player name is not empty after trimming
    if (playerName.length === 0) {
      return Response.json({ error: '玩家名称不能为空' }, { status: 400 });
    }
    
    // Sanitize player name by removing potentially dangerous characters
    // Allow only alphanumeric, Chinese characters, spaces, and common punctuation
    playerName = playerName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\-_]/g, '');
    
    // Re-validate after sanitization
    if (playerName.length === 0) {
      playerName = 'Player';
    }

    if (!roomName) {
      return Response.json({ error: '请输入房间名称' }, { status: 400 });
    }

    // Validate room name length to prevent potential issues
    if (roomName.length > 100) {
      return Response.json({ error: '房间名称过长（最多100字符）' }, { status: 400 });
    }

    const roomId = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const now = Date.now();

    // Use transaction to prevent race condition in room creation
    // This ensures atomicity: either all operations succeed or all fail
    const result = await db.batch([
      // 创建房间
      db.prepare(
        'INSERT INTO rooms (id, name, created_at, red_player_id, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(roomId, roomName, now, playerId, 'waiting'),
      
      // 初始化游戏状态
      db.prepare(
        `INSERT INTO game_state (room_id, board, current_turn, move_count, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(roomId, JSON.stringify(INITIAL_BOARD), 'red', 0, 'waiting', now),
      
      // 创建玩家记录
      db.prepare(
        'INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)'
      ).bind(playerId, roomId, 'red', playerName, now)
    ]);

    // Check if all operations succeeded
    if (!result || result.length !== 3 || !result.every(r => r.success)) {
      console.error('[API] Room creation transaction failed');
      throw new Error('Failed to create room');
    }

    return Response.json({
      roomId,
      roomName,
      playerId,
      color: 'red'
    });
  } catch (error) {
    console.error('[API] Create room error:', error);
    
    // If error occurred during room creation, attempt cleanup
    // This handles incomplete error recovery
    if (error.message && error.message.includes('Failed to create room')) {
      try {
        // Attempt to clean up any partially created resources using roomId
        const body = await context.request.json().catch(() => ({}));
        if (body.roomName) {
          const existing = await db.prepare(
            'SELECT id FROM rooms WHERE name = ?'
          ).bind(body.roomName.trim()).first();
          
          if (existing) {
            const isStale = await checkRoomStale(existing.id, db);
            if (isStale) {
              await cleanupRoom(existing.id, db);
              console.log(`[API] Cleaned up incomplete room: ${existing.id}`);
            }
          }
        }
        // Also cleanup by roomId if we have it
        if (body.roomId) {
          const isStale = await checkRoomStale(body.roomId, db);
          if (isStale) {
            await cleanupRoom(body.roomId, db);
            console.log(`[API] Cleaned up incomplete room by roomId: ${body.roomId}`);
          }
        }
      } catch (cleanupError) {
        console.error('[API] Cleanup error:', cleanupError);
      }
    }
    
    return Response.json({ error: '创建房间失败，请稍后重试' }, { status: 500 });
  }
}