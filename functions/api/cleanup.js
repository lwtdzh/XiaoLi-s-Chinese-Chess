// POST /api/cleanup — Clean up stale rooms
// This endpoint can be called periodically via cron or manually

const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  try {
    // Optional: Verify a secret token for security
    const authHeader = request.headers.get('Authorization');
    // For now, we'll allow without auth since it's just cleanup
    // In production, you might want: if (authHeader !== `Bearer ${env.CLEANUP_SECRET}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const staleThreshold = now - STALE_TIMEOUT;
    
    // Find and delete stale rooms
    const staleRooms = await db.prepare(`
      SELECT r.id 
      FROM rooms r
      LEFT JOIN players p ON r.id = p.room_id
      GROUP BY r.id
      HAVING 
        COUNT(p.id) = 0 
        OR (SUM(p.connected) = 0 AND MAX(p.last_seen) < ?)
    `).bind(staleThreshold).all();
    
    let deletedCount = 0;
    
    if (staleRooms.results && staleRooms.results.length > 0) {
      for (const room of staleRooms.results) {
        try {
          await db.batch([
            db.prepare('DELETE FROM players WHERE room_id = ?').bind(room.id),
            db.prepare('DELETE FROM game_state WHERE room_id = ?').bind(room.id),
            db.prepare('DELETE FROM rooms WHERE id = ?').bind(room.id)
          ]);
          deletedCount++;
        } catch (e) {
          console.error(`[Cleanup] Failed to delete room ${room.id}:`, e);
        }
      }
    }
    
    return Response.json({ 
      success: true, 
      deletedRooms: deletedCount,
      message: deletedCount > 0 ? `Cleaned up ${deletedCount} stale rooms` : 'No stale rooms found'
    });
  } catch (error) {
    console.error('[API] Cleanup error:', error);
    return Response.json({ error: '清理失败' }, { status: 500 });
  }
}