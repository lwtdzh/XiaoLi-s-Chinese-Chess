# Troubleshooting Guide

## Common Issues and Solutions

### Issue: "Failed to create room"

#### Possible Causes:

1. **D1 Database Not Configured**
   - **Symptom**: Error message says "Database not configured"
   - **Solution**: 
     - Check if you created the D1 database in Cloudflare Dashboard
     - Verify `wrangler.toml` has the correct `database_id`
     - Make sure D1 binding is configured in Cloudflare Pages settings

2. **Database Tables Not Initialized**
   - **Symptom**: Database error about missing tables
   - **Solution**: 
     - The database should auto-initialize on first visit
     - If it doesn't, manually run the schema in the dashboard console
     - Open your site in a browser to trigger auto-initialization

3. **Database Not Available**
   - **Symptom**: Connection timeout or 500 errors
   - **Solution**: 
     - Check Cloudflare Dashboard for D1 service status
     - Verify your account has D1 access
     - Try creating a new D1 database

#### Debug Steps:

1. **Check Browser Console**:
   ```
   Open Developer Tools (F12)
   Go to Console tab
   Look for WebSocket error messages
   ```

2. **Check Cloudflare Logs**:
   ```
   Go to Cloudflare Dashboard
   Navigate to your Pages project
   Click on "Functions" → "Logs"
   Look for error messages with [createRoom] prefix
   ```

3. **Verify Database Setup**:
   ```
   Go to Cloudflare Dashboard
   Navigate to D1 → chinese_chess_db
   Click on "Console" tab
   Run: SELECT name FROM sqlite_master WHERE type='table';
   Should see: rooms, game_state, players
   ```

### Issue: "Room not found" when joining

#### Possible Causes:

1. **Room Doesn't Exist**
   - **Solution**: Verify the room ID/name is correct
   - Check if the room was successfully created

2. **Database Connection Issue**
   - **Solution**: Same as "Failed to create room" issue #1

3. **Different Server Instances**
   - **Solution**: This should be fixed with D1 database
   - Verify database is working correctly

### Issue: WebSocket Connection Fails

#### Possible Causes:

1. **Connection Status Shows Disconnected**
   - **Wait**: The WebSocket might still be connecting
   - **Refresh**: Try refreshing the page
   - **Check Network**: Ensure internet connection is stable

2. **WebSocket Error in Console**
   - **Check**: Browser console for specific error
   - **Verify**: Cloudflare Pages Functions are deployed
   - **Check**: D1 binding is configured

### Issue: Moves Not Syncing

#### Possible Causes:

1. **Database Write Failed**
   - **Check**: Cloudflare logs for database errors
   - **Verify**: D1 database is accessible
   - **Check**: Room ID is correct

2. **WebSocket Broadcast Failed**
   - **Check**: Both players are connected
   - **Verify**: Connection status shows "Connected"
   - **Check**: Opponent hasn't disconnected

### How to Get Detailed Error Messages

The system now includes detailed logging:

1. **Browser Console Errors**:
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for error messages with details

2. **Server-Side Logs**:
   - Go to Cloudflare Dashboard
   - Navigate to your Pages project
   - Click on "Functions" → "Logs"
   - Look for messages with prefixes like:
     - `[createRoom]`
     - `[joinRoom]`
     - `[handleMove]`
     - `[initializeDatabase]`

### Quick Diagnostic Checklist

Before reporting an issue, check:

- [ ] D1 database created in Cloudflare Dashboard
- [ ] Database ID copied to `wrangler.toml`
- [ ] D1 binding configured in Pages settings
- [ ] Tables exist (rooms, game_state, players)
- [ ] Project deployed successfully
- [ ] Browser console shows WebSocket connected
- [ ] No errors in Cloudflare Functions logs

### Getting Help

If you're still stuck:

1. **Check the Logs**:
   - Browser console (F12 → Console)
   - Cloudflare Functions logs (Dashboard → Pages → Functions → Logs)

2. **Verify Setup**:
   - D1 database exists
   - `wrangler.toml` has correct database_id
   - D1 binding configured in Pages settings

3. **Test Database**:
   - Go to D1 console in dashboard
   - Run: `SELECT * FROM rooms;`
   - Should show empty or existing rooms

4. **Restart Everything**:
   - Redeploy the project
   - Clear browser cache
   - Try in incognito mode

### Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Database not configured" | D1 binding missing | Configure D1 in Pages settings |
| "Room name already exists" | Duplicate room name | Use different room name |
| "Room not found" | Wrong room ID/name | Verify room ID/name |
| "Room is full" | Two players already | Join different room |
| "Not your turn" | Opponent's turn | Wait for opponent to move |
| "Database error: ..." | SQL operation failed | Check Cloudflare logs |

### Database Initialization Issues

If auto-initialization doesn't work:

1. **Manual Initialization**:
   ```
   Go to Cloudflare Dashboard
   Navigate to D1 → chinese_chess_db
   Click on "Console" tab
   Copy contents of schema.sql
   Paste and execute
   ```

2. **Check Initialization Flag**:
   - The system uses an in-memory flag
   - Each server instance initializes once
   - If it fails, logs will show the error

### Performance Issues

If the game feels slow:

1. **Check Database Latency**:
   - D1 should respond in <100ms
   - Slower responses indicate network issues

2. **WebSocket Latency**:
   - Should be <50ms for move sync
   - Check network connection

3. **Server Load**:
   - Check Cloudflare dashboard for service status
   - High load might cause delays
