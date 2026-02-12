# Setting Up D1 Database via Cloudflare Dashboard

This guide shows you how to create and configure the Cloudflare D1 database using the web dashboard instead of the command line.

## Step 1: Access Cloudflare Dashboard

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Log in to your Cloudflare account
3. Select your account/workspace

## Step 2: Create D1 Database

### Option A: From Home Page
1. On the dashboard home page, scroll to **"Workers & Pages"**
2. Click on **"D1"** (or "Create" → "D1 Database")
3. Click **"Create database"**

### Option B: From Workers & Pages
1. In the left sidebar, click **"Workers & Pages"**
2. Click **"D1"** in the sub-menu
3. Click **"Create database"** button

## Step 3: Configure Database

1. **Database name**: Enter `chinese_chess_db`
2. Click **"Create"**

You'll see a success message with your database details:
- **Database name**: chinese_chess_db
- **Database ID**: Copy this ID (you'll need it!)

## Step 4: Copy Database ID

After creating the database, you'll see a section like:

```
Database ID
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Copy this ID!** You'll need it for your `wrangler.toml` file.

## Step 5: Update wrangler.toml

Open your `wrangler.toml` file and update it with your database ID:

```toml
name = "xiaoli-chinese-chess"
main = "server.js"
compatibility_date = "2024-01-01"

[site]
bucket = "./public"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "chinese_chess_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Paste your ID here

[[routes]]
pattern = "/*"
custom_domain = true
```

Replace `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` with your actual database ID from Step 4.

## Step 6: Initialize Database Schema (Run SQL)

### Method A: Using Dashboard Console (Easiest)

1. Go to your D1 database in the dashboard
2. Click on the **"Console"** tab
3. Copy the contents of your `schema.sql` file
4. Paste it into the console
5. Click **"Execute"** (or press Ctrl+Enter)

### Method B: Using Command Line (If you prefer)

If you have Wrangler CLI installed:

```bash
wrangler d1 execute chinese_chess_db --file=./schema.sql --remote
```

### The SQL Schema to Run

Your `schema.sql` file contains:

```sql
-- Database schema for Chinese Chess game
-- Cloudflare D1 database

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    red_player_id TEXT,
    black_player_id TEXT,
    status TEXT DEFAULT 'waiting' -- 'waiting', 'playing', 'finished'
);

-- Game state table
CREATE TABLE IF NOT EXISTS game_state (
    room_id TEXT PRIMARY KEY,
    board TEXT NOT NULL, -- JSON string of the board
    current_turn TEXT NOT NULL, -- 'red' or 'black'
    last_move TEXT, -- JSON string of last move
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    color TEXT NOT NULL, -- 'red' or 'black'
    connected INTEGER DEFAULT 1, -- 1 = connected, 0 = disconnected
    last_seen INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at);
```

## Step 7: Verify Tables Were Created

### Using Dashboard Console

1. In the D1 database console, run this query:
```sql
SELECT name FROM sqlite_master WHERE type='table';
```

2. You should see:
   - rooms
   - game_state
   - players

### Using Command Line

```bash
wrangler d1 execute chinese_chess_db --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
```

## Step 8: Deploy Your Project

Now that the database is set up, deploy your project:

```bash
npm run build
wrangler pages deploy public
```

Or if you're using Cloudflare Pages with GitHub integration:
1. Push your changes to GitHub
2. Cloudflare will automatically deploy
3. The D1 binding will be configured automatically

## Step 9: Configure D1 Binding in Cloudflare Pages (If using GitHub)

If you're using Cloudflare Pages with automatic deployment:

1. Go to your Pages project in the dashboard
2. Click on **"Settings"** → **"Functions"**
3. Scroll to **"D1 database bindings"**
4. Click **"Add binding"**
5. Fill in:
   - **Variable name**: `DB`
   - **D1 database**: Select `chinese_chess_db`
6. Click **"Save"**
7. Click **"Save and Deploy"**

## Troubleshooting

### "Database not found" error

- Make sure you've created the database in the same account
- Check that the database ID in `wrangler.toml` matches your actual database ID

### "Table doesn't exist" error

- Make sure you've run the `schema.sql` file in the console
- Verify the tables were created using the query in Step 7

### Can't find D1 in the dashboard

- Make sure you're on the correct account
- D1 might be under "Workers & Pages" → "D1"
- If you don't see D1, your account might not have access yet (contact Cloudflare support)

## Dashboard Navigation Summary

```
Cloudflare Dashboard
└── Workers & Pages
    └── D1
        ├── chinese_chess_db (your database)
        │   ├── Console (run SQL here)
        │   ├── Settings (view database ID)
        │   └── Metrics (usage stats)
```

## Alternative: Using Wrangler CLI (If you prefer command line)

If you prefer using the command line instead of the dashboard:

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create database
wrangler d1 create chinese_chess_db

# Copy the database ID from the output

# Update wrangler.toml with the database ID

# Initialize schema
wrangler d1 execute chinese_chess_db --file=./schema.sql --remote

# Deploy
wrangler pages deploy public
```

## Summary

✅ **Created D1 database** via dashboard  
✅ **Copied database ID**  
✅ **Updated wrangler.toml** with database ID  
✅ **Ran schema.sql** to create tables  
✅ **Verified tables** were created  
✅ **Deployed project**  

Your multiplayer Chinese Chess game is now ready with persistent database storage! 🎮♟️
