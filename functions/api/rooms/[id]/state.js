// GET /api/rooms/:id/state?since=<timestamp> — 轮询游戏状态

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const playerId = url.searchParams.get('playerId') || '';

    // 更新玩家最后活跃时间
    // 断线重连优先：仅当玩家属于该房间时才更新，避免任意 playerId 影响连接状态
    if (playerId) {
      await db.prepare(
        'UPDATE players SET last_seen = ?, connected = 1 WHERE id = ? AND room_id = ?'
      ).bind(Date.now(), playerId, roomId).run();
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
        board: JSON.parse(state.board),
        currentTurn: state.current_turn,
        lastMove: state.last_move ? JSON.parse(state.last_move) : null,
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
