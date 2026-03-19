// POST /api/rooms/:id/join — 加入房间

export async function onRequestPost(context) {
  const { env, params } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    const body = await context.request.json();

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
      const existingPlayer = await db.prepare(
        'SELECT id, color, name, connected FROM players WHERE id = ? AND room_id = ?'
      ).bind(body.playerId, room.id).first();

      if (existingPlayer) {
        // 断线重连优先：允许“踢下线并接管”
        // 场景：多开标签页/网络抖动导致旧端仍显示 connected=1，但用户希望用同一 playerId 恢复。
        // 做法：直接以 playerId 为准接管席位（本表以 playerId 作为唯一连接标识）。
        await db.prepare(
          'UPDATE players SET connected = 1, last_seen = ? WHERE id = ? AND room_id = ?'
        ).bind(Date.now(), body.playerId, room.id).run();

        const gameState = await db.prepare(
          'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
        ).bind(room.id).first();

        return Response.json({
          roomId: room.id,
          roomName: room.name,
          playerId: existingPlayer.id,
          color: existingPlayer.color,
          reconnected: true,
          gameState: gameState ? {
            board: JSON.parse(gameState.board),
            currentTurn: gameState.current_turn,
            lastMove: gameState.last_move ? JSON.parse(gameState.last_move) : null,
            moveCount: gameState.move_count,
            status: gameState.status,
            winner: gameState.winner,
            updatedAt: gameState.updated_at
          } : null
        });
      }
    }

    // 检查房间是否已满
    // 断线重连优先：即使 connected=0，也不允许第三人顶替席位
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

      // 房间满员后再把 game_state 置为 playing
      await db.prepare(
        'UPDATE game_state SET status = ?, updated_at = ? WHERE room_id = ? AND status != ?'
      ).bind('playing', Date.now(), room.id, 'ended').run();
    }

    // 创建玩家记录
    await db.prepare(
      'INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)'
    ).bind(playerId, room.id, assignedColor, body.playerName || 'Player', now).run();

    // 获取游戏状态
    const gameState = await db.prepare(
      'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
    ).bind(room.id).first();

    return Response.json({
      roomId: room.id,
      roomName: room.name,
      playerId,
      color: assignedColor,
      gameState: gameState ? {
        board: JSON.parse(gameState.board),
        currentTurn: gameState.current_turn,
        lastMove: gameState.last_move ? JSON.parse(gameState.last_move) : null,
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
