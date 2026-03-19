// 全局中间件 — 确保数据库表已初始化 & 概率性清理过期房间

// Workers 实例可能随时回收，模块级缓存仅用于同一实例内的多次请求优化
let dbInitialized = false;

const STALE_ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function initializeDatabase(db) {
  if (dbInitialized) return;

  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          red_player_id TEXT,
          black_player_id TEXT,
          status TEXT DEFAULT 'waiting'
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS game_state (
          room_id TEXT PRIMARY KEY,
          board TEXT NOT NULL,
          current_turn TEXT NOT NULL,
          last_move TEXT,
          move_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'waiting',
          winner TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          color TEXT NOT NULL,
          name TEXT DEFAULT 'Player',
          connected INTEGER DEFAULT 1,
          last_seen INTEGER NOT NULL,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        )
      `),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at)')
    ]);
    dbInitialized = true;
  } catch (error) {
    // 初始化失败不设置缓存，下次请求会重试
    console.error('[Middleware] DB init error:', error);
  }
}

async function cleanupAllStaleRooms(db) {
  try {
    const now = Date.now();
    const cutoff = now - STALE_ROOM_TIMEOUT;

    // Find rooms where ALL players are disconnected AND inactive beyond timeout,
    // or rooms that have no players at all.
    const staleRooms = await db.prepare(`
      SELECT r.id FROM rooms r
      WHERE NOT EXISTS (
        SELECT 1 FROM players p
        WHERE p.room_id = r.id AND (p.connected = 1 OR p.last_seen > ?)
      )
    `).bind(cutoff).all();

    const roomIds = (staleRooms.results || []).map(r => r.id);
    if (roomIds.length === 0) return;

    // Batch delete in chunks to stay within D1 limits
    // Added error handling for individual deletions
    for (const roomId of roomIds) {
      try {
        await db.batch([
          db.prepare('DELETE FROM players WHERE room_id = ?').bind(roomId),
          db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(roomId),
          db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
        ]);
      } catch (deleteError) {
        console.error(`[Middleware] Failed to delete room ${roomId}:`, deleteError);
      }
    }

    console.log(`[Middleware] Cleaned up ${roomIds.length} stale room(s)`);
  } catch (error) {
    // Never let cleanup failure affect normal requests
    console.error('[Middleware] Stale room cleanup error:', error);
  }
}

export async function onRequest(context) {
  const { env } = context;

  if (env.DB) {
    await initializeDatabase(env.DB);

    // ~10% chance to trigger global stale room cleanup per request
    if (Math.random() < 0.1) {
      context.waitUntil(cleanupAllStaleRooms(env.DB));
    }
  }

  const isApiRequest = context.request.url.includes('/api/');

  // 对 API 的 OPTIONS 预检请求，直接返回 CORS 头，不再执行后续路由
  if (isApiRequest && context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  const response = await context.next();

  // 为 API 响应添加 CORS headers
  if (isApiRequest) {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return response;
}