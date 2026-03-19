// GET /api/rooms/:id — 获取房间信息和游戏状态

export async function onRequestGet(context) {
  const { env, params } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    const room = await db.prepare(
      'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE id = ?'
    ).bind(roomId).first();

    if (!room) {
      // 尝试通过名称查找
      const roomByName = await db.prepare(
        'SELECT id, name, status, red_player_id, black_player_id FROM rooms WHERE name = ?'
      ).bind(roomId).first();

      if (!roomByName) {
        return Response.json({ error: '房间不存在' }, { status: 404 });
      }

      return await buildRoomResponse(db, roomByName);
    }

    return await buildRoomResponse(db, room);
  } catch (error) {
    console.error('[API] Get room error:', error);
    return Response.json({ error: '获取房间信息失败' }, { status: 500 });
  }
}

async function buildRoomResponse(db, room) {
  const gameState = await db.prepare(
    'SELECT board, current_turn, last_move, move_count, status, winner, updated_at FROM game_state WHERE room_id = ?'
  ).bind(room.id).first();

  const players = await db.prepare(
    'SELECT id, color, name, connected FROM players WHERE room_id = ?'
  ).bind(room.id).all();

  return Response.json({
    room: {
      id: room.id,
      name: room.name,
      status: room.status,
      hasRed: !!room.red_player_id,
      hasBlack: !!room.black_player_id
    },
    gameState: gameState ? {
      board: JSON.parse(gameState.board),
      currentTurn: gameState.current_turn,
      lastMove: gameState.last_move ? JSON.parse(gameState.last_move) : null,
      moveCount: gameState.move_count,
      status: gameState.status,
      winner: gameState.winner,
      updatedAt: gameState.updated_at
    } : null,
    players: players.results || []
  });
}
