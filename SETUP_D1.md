
# Setting Up Cloudflare D1 Database

This guide will help you set up the D1 database for the Chinese Chess game.

## Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

## Step 2: Login to Cloudflare

```bash
wrangler login
```

## Step 3: Create D1 Database

```bash
wrangler d1 create chinese_chess_db
```

You'll get output like:
```
✨ Successfully created DB 'chinese_chess_db'
[[d1_databases]]
binding = "DB"
database_name = "chinese_chess_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## Step 4: Update wrangler.toml

Copy the `database_id` from the output above and update your `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "chinese_chess_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Replace `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` with your actual database ID.

## Step 5: Initialize Database Schema

Run the schema.sql file to create the tables:

```bash
wrangler d1 execute chinese_chess_db --file=./schema.sql --remote
```

## Step 6: Verify Database Setup

You can verify the tables were created:

```bash
wrangler d1 execute chinese_chess_db --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
```

You should see:
- rooms
- game_state
- players

## Step 7: Deploy

Now deploy your project:

```bash
npm run build
wrangler pages deploy public
```

## How It Works

### Database Architecture

1. **rooms table**: Stores room information
   - id: Unique room identifier
   - name: Room name (unique)
   - created_at: Timestamp
   - red_player_id: Connection ID of red player
   - black_player_id: Connection ID of black player
   - status: 'waiting', 'playing', or 'finished'

2. **game_state table**: Stores current game state
   - room_id: Reference to room
   - board: JSON string of the board
   - current_turn: 'red' or 'black'
   - last_move: JSON string of last move
   - updated_at: Timestamp

3. **players table**: Stores player connection info
   - id: Connection ID
   - room_id: Reference to room
   - color: 'red' or 'black'
   - connected: 1 or 0
   - last_seen: Timestamp

### Real-Time Synchronization

1. **Player moves piece**:
   - Frontend sends move to WebSocket
   - Server updates database with new board state
   - Server broadcasts move to opponent via WebSocket
   - Opponent receives move immediately

2. **Why it works**:
   - Database provides **persistent shared state** across all server instances
   - WebSocket provides **real-time communication** for immediate updates
   - Combination ensures both players see changes instantly

### Performance

- Database writes: ~10-50ms
- WebSocket broadcast: <5ms
- Total latency: <100ms for move synchronization

## Troubleshooting

### "Database not found" error

Make sure you've updated the `database_id` in `wrangler.toml` with your actual ID.

### "Table doesn't exist" error

Run the schema initialization:
```bash
wrangler d1 execute chinese_chess_db --file=./schema.sql --remote
```

### Room not found when joining

Check the database:
```bash
wrangler d1 execute chinese_chess_db --command="SELECT * FROM rooms" --remote
```

## Local Development

For local development with D1:

```bash
# Create local database
wrangler d1 execute chinese_chess_db --file=./schema.sql --local

# Run with local database
wrangler pages dev public --d1=DB=chinese_chess_db
```
