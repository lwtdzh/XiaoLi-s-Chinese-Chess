// POST /api/rooms/:id/join — 加入房间

// Rate limiting for room joining
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 joins per minute per IP

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
      return Response.json({ error: '加入房间过于频繁，请稍后重试' }, { status: 429 });
    }
    
    const body = await context.request.json();

    // Validate player name length
    const playerName = (body.playerName || 'Player').trim();
    if (playerName.length > 50) {
      return Response.json({ error: '玩家名称过长（最多50字符）' }, { status: 400 });
    }

    // 先通过 ID 查找，再通过名称查找
    let room = await db.prepare(
      'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE id = ?'
    ).bind(roomId).first();

    if (!room) {
      room = await db.prepare(
        'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE name = ?'
      ).bind(roomId).first();
    }

    if (!room) {
      return Response.json({ error: '房间不存在' }, { status: 404 });
    }

    // 检查是否是已有玩家重连
    if (body.playerId) {
      // 验证 playerId 格式
      if (!/^[a-f0-9-]{36}$/.test(body.playerId)) {
        return Response.json({ error: '无效的 playerId 格式' }, { status: 400 });
      }
      
      const existingPlayer = await db.prepare(
        'SELECT id, color, name, connected FROM players WHERE id = ? AND room_id = ?'
      ).bind(body.playerId, room.id).first();

      if (existingPlayer) {
        // 验证外键约束：确保房间仍然存在
        const roomExists = await db.prepare(
          'SELECT id FROM rooms WHERE id = ?'
        ).bind(room.id).first();
        
        if (!roomExists) {
          return Response.json({ error: '房间不存在' }, { status: 404 });
        }
        
        // 断线重连优先：允许"踢下线并接管"
        const updateResult = await db.prepare(
          'UPDATE players SET connected = 1, last_seen = ? WHERE id = ? AND room_id = ?'
        ).bind(Date.now(), body.playerId, room.id).run();
        
        if (!updateResult.success) {
          return Response.json({ error: '重连失败' }, { status: 500 });
        }

        const gameState = await db.prepare(
          'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
        ).bind(room.id).first();

        // Add JSON parsing error handling
        let parsedBoard;
        let parsedLastMove = null;
        try {
          if (gameState) {
            parsedBoard = JSON.parse(gameState.board);
            if (gameState.last_move) {
              parsedLastMove = JSON.parse(gameState.last_move);
            }
          }
        } catch (parseError) {
          console.error('[API] JSON parse error in join reconnection:', parseError);
          return Response.json({ error: '游戏状态数据损坏' }, { status: 500 });
        }

        return Response.json({
          roomId: room.id,
          roomName: room.name,
          playerId: existingPlayer.id,
          color: existingPlayer.color,
          reconnected: true,
          gameState: gameState ? {
            board: parsedBoard,
            currentTurn: gameState.current_turn,
            lastMove: parsedLastMove,
            moveCount: gameState.move_count,
            status: gameState.status,
            winner: gameState.winner,
            updatedAt: gameState.updated_at
          } : null
        });
      }
    }

    // 检查房间是否已满
    if (room.red_player_id && room.black_player_id) {
      return Response.json({ error: '房间已满' }, { status: 409 });
    }

    // 验证外键约束：确保房间存在且有效
    const roomValidation = await db.prepare(
      'SELECT id, status FROM rooms WHERE id = ?'
    ).bind(room.id).first();
    
    if (!roomValidation) {
      return Response.json({ error: '房间不存在' }, { status: 404 });
    }
    
    if (roomValidation.status === 'finished') {
      return Response.json({ error: '房间已结束' }, { status: 409 });
    }

    const playerId = crypto.randomUUID();
    const now = Date.now();
    let assignedColor;

    // 使用事务防止竞态条件：确保颜色分配的原子性
    // 通过条件更新确保只有一个玩家能成功获取某个颜色
    if (!room.red_player_id) {
      assignedColor = 'red';
      const result = await db.batch([
        // 条件更新：只有当 red_player_id 为 NULL 时才更新
        db.prepare('UPDATE rooms SET red_player_id = ? WHERE id = ? AND red_player_id IS NULL')
          .bind(playerId, room.id),
        // 插入玩家记录
        db.prepare('INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)')
          .bind(playerId, room.id, assignedColor, playerName, now)
      ]);

      // 验证是否成功获取红色位置（检查更新是否影响了行）
      const updatedRoom = await db.prepare(
        'SELECT red_player_id FROM rooms WHERE id = ?'
      ).bind(room.id).first();

      if (!updatedRoom || updatedRoom.red_player_id !== playerId) {
        // 另一个玩家已经抢先获取了红色位置
        return Response.json({ error: '房间已满' }, { status: 409 });
      }
    } else {
      assignedColor = 'black';
      const result = await db.batch([
        // 条件更新：只有当 black_player_id 为 NULL 时才更新
        db.prepare('UPDATE rooms SET black_player_id = ?, status = ? WHERE id = ? AND black_player_id IS NULL')
          .bind(playerId, 'playing', room.id),
        // 更新游戏状态
        db.prepare('UPDATE game_state SET status = ?, updated_at = ? WHERE room_id = ? AND status != ?')
          .bind('playing', Date.now(), room.id, 'ended'),
        // 插入玩家记录
        db.prepare('INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)')
          .bind(playerId, room.id, assignedColor, playerName, now)
      ]);

      // 验证是否成功获取黑色位置
      const updatedRoom = await db.prepare(
        'SELECT black_player_id FROM rooms WHERE id = ?'
      ).bind(room.id).first();

      if (!updatedRoom || updatedRoom.black_player_id !== playerId) {
        // 另一个玩家已经抢先获取了黑色位置
        return Response.json({ error: '房间已满' }, { status: 409 });
      }
    }

    const gameState = await db.prepare(
      'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
    ).bind(room.id).first();

    // Add JSON parsing error handling
    let parsedBoard;
    let parsedLastMove = null;
    try {
      if (gameState) {
        parsedBoard = JSON.parse(gameState.board);
        if (gameState.last_move) {
          parsedLastMove = JSON.parse(gameState.last_move);
        }
      }
    } catch (parseError) {
      console.error('[API] JSON parse error in join new player:', parseError);
      return Response.json({ error: '游戏状态数据损坏' }, { status: 500 });
    }

    return Response.json({
      roomId: room.id,
      roomName: room.name,
      playerId,
      color: assignedColor,
      gameState: gameState ? {
        board: parsedBoard,
        currentTurn: gameState.current_turn,
        lastMove: parsedLastMove,
        moveCount: gameState.move_count,
        status: gameState.status,
        winner: gameState.winner,
        updatedAt: gameState.updated_at
      } : null
    });
  } catch (error) {
    console.error('[API] Join room error:', error);
    return Response.json({ error: '加入房间失败' }, { status: 500 });
  }
}