// POST /api/rooms/:id/leave — 离开房间

// Rate limiting for room leaving
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // Max 20 leaves per minute per IP

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

// Clean up stale rooms (no connected players for 5+ minutes)
async function cleanupStaleRooms(db) {
  const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const staleThreshold = now - STALE_TIMEOUT;
  
  try {
    // Find rooms where all players are disconnected and inactive
    const staleRooms = await db.prepare(`
      SELECT r.id 
      FROM rooms r
      LEFT JOIN players p ON r.id = p.room_id
      GROUP BY r.id
      HAVING 
        COUNT(p.id) > 0 
        AND SUM(p.connected) = 0
        AND MAX(p.last_seen) < ?
    `).bind(staleThreshold).all();
    
    if (staleRooms.results && staleRooms.results.length > 0) {
      console.log(`[Cleanup] Found ${staleRooms.results.length} stale rooms`);
      
      for (const room of staleRooms.results) {
        await db.batch([
          db.prepare('DELETE FROM players WHERE room_id = ?').bind(room.id),
          db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(room.id),
          db.prepare('DELETE FROM rooms WHERE id = ?').bind(room.id)
        ]);
        console.log(`[Cleanup] Deleted stale room: ${room.id}`);
      }
      
      return staleRooms.results.length;
    }
    
    return 0;
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return 0;
  }
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    // Check rate limit based on client IP
    const clientIp = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 
                    'unknown';
    
    if (!checkRateLimit(clientIp)) {
      return Response.json({ error: '离开房间过于频繁，请稍后重试' }, { status: 429 });
    }
    
    const body = await context.request.json();
    const { playerId } = body;

    if (!playerId) {
      return Response.json({ error: '缺少 playerId' }, { status: 400 });
    }

    // Validate playerId format to prevent potential injection
    if (!/^[a-f0-9-]{36}$/.test(playerId)) {
      return Response.json({ error: '无效的 playerId 格式' }, { status: 400 });
    }

    // Validate roomId format (UUID)
    if (!/^[a-f0-9-]{36}$/.test(roomId)) {
      return Response.json({ error: '无效的 roomId 格式' }, { status: 400 });
    }

    // 获取玩家信息和房间状态
    const player = await db.prepare(
      'SELECT id, color FROM players WHERE id = ? AND room_id = ?'
    ).bind(playerId, roomId).first();

    if (!player) {
      return Response.json({ error: '玩家不在此房间' }, { status: 404 });
    }

    // 获取房间信息
    const room = await db.prepare(
      'SELECT red_player_id, black_player_id, status FROM rooms WHERE id = ?'
    ).bind(roomId).first();

    const now = Date.now();
    
    // 标记玩家断开连接
    await db.prepare(
      'UPDATE players SET connected = 0, last_seen = ? WHERE id = ?'
    ).bind(now, playerId).run();

    // 清空该玩家的席位（允许其他人加入）
    if (player.color === 'red' && room) {
      await db.prepare(
        'UPDATE rooms SET red_player_id = NULL WHERE id = ?'
      ).bind(roomId).run();
    } else if (player.color === 'black' && room) {
      await db.prepare(
        'UPDATE rooms SET black_player_id = NULL WHERE id = ?'
      ).bind(roomId).run();
    }

    // 如果房间变成空的，重置状态为 waiting
    const updatedRoom = await db.prepare(
      'SELECT red_player_id, black_player_id FROM rooms WHERE id = ?'
    ).bind(roomId).first();
    
    if (updatedRoom && !updatedRoom.red_player_id && !updatedRoom.black_player_id) {
      await db.prepare(
        'UPDATE rooms SET status = ? WHERE id = ?'
      ).bind('waiting', roomId).run();
      
      // 删除该房间的所有玩家记录（房间已空）
      await db.prepare(
        'DELETE FROM players WHERE room_id = ?'
      ).bind(roomId).run();
      
      console.log(`[Leave] Room ${roomId} is now empty, cleaned up players`);
    }

    // 定期清理过期房间（每次离开时触发，概率性执行）
    // 这样可以避免额外的 cron job 配置
    if (Math.random() < 0.1) { // 10% 概率触发清理
      const cleaned = await cleanupStaleRooms(db);
      if (cleaned > 0) {
        console.log(`[Leave] Cleaned up ${cleaned} stale rooms`);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[API] Leave room error:', error);
    return Response.json({ error: '离开房间失败' }, { status: 500 });
  }
}