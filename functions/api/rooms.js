// POST /api/rooms — 创建房间

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

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    const body = await context.request.json();
    const roomName = (body.roomName || '').trim();

    if (!roomName) {
      return Response.json({ error: '请输入房间名称' }, { status: 400 });
    }

    // 检查房间名是否已存在
    const existing = await db.prepare(
      'SELECT id FROM rooms WHERE name = ?'
    ).bind(roomName).first();

    if (existing) {
      return Response.json({ error: '房间名称已存在' }, { status: 409 });
    }

        const roomId = crypto.randomUUID();
        const playerId = crypto.randomUUID();
        const now = Date.now();
    
        // 创建房间
        await db.prepare(
          'INSERT INTO rooms (id, name, created_at, red_player_id, status) VALUES (?, ?, ?, ?, ?)'
        ).bind(roomId, roomName, now, playerId, 'waiting').run();
    
        // 初始化游戏状态：断线重连优先语义下，status 表示对局是否开始/结束
        // 创建房间后只有红方在场，仍然视为 waiting
        await db.prepare(
          `INSERT INTO game_state (room_id, board, current_turn, move_count, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(roomId, JSON.stringify(INITIAL_BOARD), 'red', 0, 'waiting', now).run();
    
        // 创建玩家记录
        await db.prepare(
          'INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)'
        ).bind(playerId, roomId, 'red', body.playerName || 'Player', now).run();
        return Response.json({
      roomId,
      roomName,
      playerId,
      color: 'red'
    });
  } catch (error) {
    console.error('[API] Create room error:', error);
    return Response.json({ error: '创建房间失败' }, { status: 500 });
  }
}
