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

    // 获取玩家信息
    const player = await db.prepare(
      'SELECT id, color FROM players WHERE id = ? AND room_id = ?'
    ).bind(playerId, roomId).first();

    if (!player) {
      return Response.json({ error: '玩家不在此房间' }, { status: 404 });
    }

    // 标记玩家断开连接（不删除记录，便于重连）
    await db.prepare(
      'UPDATE players SET connected = 0 WHERE id = ?'
    ).bind(playerId).run();

    // 断线重连优先：leave 只标记 disconnected，不清空席位，不改变 rooms/game_state 状态
    await db.prepare(
      'UPDATE players SET last_seen = ? WHERE id = ?'
    ).bind(Date.now(), playerId).run();

    return Response.json({ success: true });
  } catch (error) {
    console.error('[API] Leave room error:', error);
    return Response.json({ error: '离开房间失败' }, { status: 500 });
  }
}