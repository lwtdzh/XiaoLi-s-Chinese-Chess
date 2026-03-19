// POST /api/rooms/:id/join — 加入房间

export async function onRequestPost(context) {
  const { env, params } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
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

    const playerId = crypto.randomUUID();
    const now = Date.now();
    let assignedColor;

    if (!room.red_player_id) {
      assignedColor = 'red';
      await db.prepare(
        'UPDATE rooms SET red_player_id = ? WHERE id = ?'
      ).bind(playerId, room.id).run();
    } else {
      assignedColor = 'black';
      await db.prepare(
        'UPDATE rooms SET black_player_id = ?, status = ? WHERE id = ?'
      ).bind(playerId, 'playing', room.id).run();

      await db.prepare(
        'UPDATE game_state SET status = ?, updated_at = ? WHERE room_id = ? AND status != ?'
      ).bind('playing', Date.now(), room.id, 'ended').run();
    }

    await db.prepare(
      'INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)'
    ).bind(playerId, room.id, assignedColor, playerName, now).run();

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