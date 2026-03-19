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

const STALE_ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function checkRoomStale(roomId, db) {
  const now = Date.now();

  const totalPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ?'
  ).bind(roomId).first();

  if (!totalPlayers || totalPlayers.count === 0) {
    return true;
  }

  const connectedPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND connected = 1'
  ).bind(roomId).first();

  const recentPlayers = await db.prepare(
    'SELECT COUNT(*) as count FROM players WHERE room_id = ? AND last_seen > ?'
  ).bind(roomId, now - STALE_ROOM_TIMEOUT).first();

  // Stale if all players are disconnected AND all inactive beyond timeout
  return (!connectedPlayers || connectedPlayers.count === 0) &&
         (!recentPlayers || recentPlayers.count === 0);
}

async function cleanupRoom(roomId, db) {
  await db.batch([
    db.prepare('DELETE FROM players WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
  ]);
}

export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;

  try {
    const body = await context.request.json();
    const roomName = (body.roomName || '').trim();

    if (!roomName) {
      return Response.json({ error: '请输入房间名称' }, { status: 400 });
    }

    // Validate room name length to prevent potential issues
    if (roomName.length > 100) {
      return Response.json({ error: '房间名称过长（最多100字符）' }, { status: 400 });
    }

    // 检查房间名是否已存在
    const existing = await db.prepare(
      'SELECT id FROM rooms WHERE name = ?'
    ).bind(roomName).first();

    if (existing) {
      const isStale = await checkRoomStale(existing.id, db);
      if (isStale) {
        await cleanupRoom(existing.id, db);
        console.log(`[API] Cleaned up stale room: ${existing.id} (name: ${roomName})`);
      } else {
        return Response.json({ error: '房间名称已存在' }, { status: 409 });
      }
    }

    const roomId = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const now = Date.now();

    // 创建房间
    const roomResult = await db.prepare(
      'INSERT INTO rooms (id, name, created_at, red_player_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(roomId, roomName, now, playerId, 'waiting').run();

    if (!roomResult.success) {
      throw new Error('Failed to create room');
    }

    // 初始化游戏状态
    const gameStateResult = await db.prepare(
      `INSERT INTO game_state (room_id, board, current_turn, move_count, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(roomId, JSON.stringify(INITIAL_BOARD), 'red', 0, 'waiting', now).run();

    if (!gameStateResult.success) {
      throw new Error('Failed to initialize game state');
    }

    // 创建玩家记录
    const playerResult = await db.prepare(
      'INSERT INTO players (id, room_id, color, name, connected, last_seen) VALUES (?, ?, ?, ?, 1, ?)'
    ).bind(playerId, roomId, 'red', body.playerName || 'Player', now).run();

    if (!playerResult.success) {
      throw new Error('Failed to create player record');
    }

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