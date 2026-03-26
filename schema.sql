-- Database schema for Chinese Chess game
-- Cloudflare D1 database

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    red_player_id TEXT,
    black_player_id TEXT,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
    winner TEXT CHECK (winner IS NULL OR winner IN ('red', 'black'))
);

-- Game state table
CREATE TABLE IF NOT EXISTS game_state (
    room_id TEXT PRIMARY KEY,
    board TEXT NOT NULL, -- JSON string of the board
    current_turn TEXT NOT NULL CHECK (current_turn IN ('red', 'black')), -- 'red' or 'black'
    last_move TEXT, -- JSON string of last move
    move_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'ended')),
    winner TEXT CHECK (winner IS NULL OR winner IN ('red', 'black')), -- 'red' or 'black' when game ends
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    color TEXT NOT NULL CHECK (color IN ('red', 'black')), -- 'red' or 'black'
    name TEXT DEFAULT 'Player',
    connected INTEGER DEFAULT 1 CHECK (connected IN (0, 1)), -- 1 = connected, 0 = disconnected
    last_seen INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_connected ON players(connected);
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen);
CREATE INDEX IF NOT EXISTS idx_game_state_updated ON game_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_game_state_status ON game_state(status);