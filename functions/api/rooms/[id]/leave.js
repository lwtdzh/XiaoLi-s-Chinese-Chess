// POST /api/rooms/:id/leave — 离开房间

export async function onRequestPost(context) {
  const { env, params } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    const body = await context.request.json();
    const { playerId } = body;

    if (!playerId) {
      return Response.json({ error: '缺少 playerId' }, { status: 400 });
    }

    // Validate playerId format to prevent potential injection
    if (!/^[a-f0-9-]{36}$/.test(playerId)) {
      return Response.json({ error: '无效的 playerId 格式' }, { status: 400 });
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