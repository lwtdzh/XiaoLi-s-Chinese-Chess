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

  // Add error handling for JSON parsing
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
    console.error('[API] JSON parse error in buildRoomResponse:', parseError);
    return Response.json({ error: '游戏状态数据损坏' }, { status: 500 });
  }

  return Response.json({
    room: {
      id: room.id,
      name: room.name,
      status: room.status,
      hasRed: !!room.red_player_id,
      hasBlack: !!room.black_player_id
    },
    gameState: gameState ? {
      board: parsedBoard,
      currentTurn: gameState.current_turn,
      lastMove: parsedLastMove,
      moveCount: gameState.move_count,
      status: gameState.status,
      winner: gameState.winner,
      updatedAt: gameState.updated_at
    } : null,
    players: players.results || []
  });
}