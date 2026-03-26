// GET /api/rooms/:id/state?since=<timestamp> — 轮询游戏状态

// Rate limiting for state polling
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // Max 60 polls per minute per IP

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

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    // Validate roomId format (UUID)
    if (!roomId || !/^[a-f0-9-]{36}$/i.test(roomId)) {
      return Response.json({ error: '无效的房间 ID 格式' }, { status: 400 });
    }
    
    // Check rate limit based on client IP
    const clientIp = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 
                    'unknown';
    
    if (!checkRateLimit(clientIp)) {
      return Response.json({ error: '轮询状态过于频繁，请稍后重试' }, { status: 429 });
    }
    
    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const playerId = url.searchParams.get('playerId') || '';

    // Validate playerId format to prevent potential injection
    if (playerId && !/^[a-f0-9-]{36}$/.test(playerId)) {
      return Response.json({ error: '无效的 playerId 格式' }, { status: 400 });
    }

    // 更新玩家最后活跃时间
    if (playerId) {
      const updateResult = await db.prepare(
        'UPDATE players SET last_seen = ?, connected = 1 WHERE id = ? AND room_id = ?'
      ).bind(Date.now(), playerId, roomId).run();
      
      // 如果更新失败（玩家不存在），仍然继续返回状态，但不影响其他玩家
      if (!updateResult.success) {
        console.warn('[API] Failed to update player last_seen, but continuing');
      }
    }

    // 获取房间信息
    const room = await db.prepare(
      'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE id = ?'
    ).bind(roomId).first();

    if (!room) {
      return Response.json({ error: '房间不存在' }, { status: 404 });
    }

    // 获取游戏状态
    const state = await db.prepare(
      'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();

    if (!state) {
      return Response.json({ error: '游戏状态不存在' }, { status: 404 });
    }

    // 获取玩家列表
    const players = await db.prepare(
      'SELECT id, color, name, connected, last_seen FROM players WHERE room_id = ?'
    ).bind(roomId).all();

    const hasUpdate = state.updated_at > since;

    // 检查对手是否在线（30秒内有活动）
    const now = Date.now();
    const opponentOnline = (players.results || []).some(
      p => p.id !== playerId && (now - p.last_seen) < 30000
    );

    // Add JSON parsing error handling
    let parsedBoard;
    let parsedLastMove = null;
    try {
      if (state) {
        parsedBoard = JSON.parse(state.board);
        if (state.last_move) {
          parsedLastMove = JSON.parse(state.last_move);
        }
      }
    } catch (parseError) {
      console.error('[API] JSON parse error in state polling:', parseError);
      return Response.json({ error: '游戏状态数据损坏' }, { status: 500 });
    }

    return Response.json({
      updated: hasUpdate,
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
        hasRed: !!room.red_player_id,
        hasBlack: !!room.black_player_id
      },
      gameState: {
        board: parsedBoard,
        currentTurn: state.current_turn,
        lastMove: parsedLastMove,
        moveCount: state.move_count,
        status: state.status,
        winner: state.winner,
        updatedAt: state.updated_at
      },
      players: players.results || [],
      opponentOnline
    });
  } catch (error) {
    console.error('[API] Poll state error:', error);
    return Response.json({ error: '获取状态失败' }, { status: 500 });
  }
}