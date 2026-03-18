# Data Access Patterns

<cite>
**Referenced Files in This Document**
- [_middleware.js](file://functions/_middleware.js)
- [schema.sql](file://schema.sql)
- [game.js](file://game.js)
- [database.test.js](file://tests/integration/database.test.js)
- [room-management.test.js](file://tests/unit/room-management.test.js)
- [setup.js](file://tests/setup.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the database access patterns and query strategies used by the application. It covers CRUD operations across rooms, game state, and players; transaction handling via batch operations; optimistic concurrency control; and query patterns for common tasks such as room discovery, game state retrieval, player connection updates, and cleanup of stale sessions. It also documents how the frontend polls for updates and how the backend ensures consistency under concurrent access.

## Project Structure
The backend is implemented as a Cloudflare Pages Function that exposes a WebSocket endpoint and serves static assets. Database operations are executed against a Cloudflare D1 SQLite-compatible database. The schema defines three primary tables with supporting indexes. Tests validate database operations and concurrency control.

```mermaid
graph TB
subgraph "Backend"
MW["_middleware.js<br/>WebSocket handler, DB init, CRUD handlers"]
end
subgraph "Database (D1)"
R["rooms<br/>id, name, created_at, red/black ids, status"]
G["game_state<br/>room_id, board, current_turn, last_move, move_count, status, updated_at"]
P["players<br/>id, room_id, color, connected, last_seen"]
IDX["Indexes<br/>idx_rooms_name, idx_rooms_status,<br/>idx_players_room_id, idx_game_state_updated"]
end
subgraph "Frontend"
FE["game.js<br/>WebSocket client, polling, UI"]
end
FE --> |"/ws" WebSocket| MW
MW --> |prepare/run/batch| R
MW --> |prepare/run/batch| G
MW --> |prepare/run/batch| P
MW --> |prepare/run| IDX
```

**Diagram sources**
- [_middleware.js:46-98](file://functions/_middleware.js#L46-L98)
- [schema.sql:5-41](file://schema.sql#L5-L41)
- [game.js:740-808](file://game.js#L740-L808)

**Section sources**
- [_middleware.js:104-122](file://functions/_middleware.js#L104-L122)
- [schema.sql:5-41](file://schema.sql#L5-L41)

## Core Components
- Database initialization and indexing: The middleware initializes tables and indexes on every request to ensure idempotency and performance.
- Room lifecycle: Create room, join room, leave room, and cleanup of stale/empty rooms.
- Game state management: Retrieve, validate, and update game state with optimistic concurrency control.
- Player connection tracking: Track connected status and last activity timestamps.
- Frontend polling: Periodic polling for opponent presence and move updates.

Key implementation references:
- Database initialization and indexes: [initializeDatabase:46-98](file://functions/_middleware.js#L46-L98)
- Room creation: [createRoom:282-351](file://functions/_middleware.js#L282-L351)
- Room join: [joinRoom:353-443](file://functions/_middleware.js#L353-L443)
- Room leave and cleanup: [leaveRoom:445-477](file://functions/_middleware.js#L445-L477), [cleanupRoom:499-505](file://functions/_middleware.js#L499-L505), [cleanupRoomIfEmpty:507-516](file://functions/_middleware.js#L507-L516)
- Game state retrieval: [handleGetGameState:685-707](file://functions/_middleware.js#L685-L707)
- Move handling with optimistic locking: [handleMove:522-683](file://functions/_middleware.js#L522-L683)
- Player connection updates: [handleMove:636-638](file://functions/_middleware.js#L636-L638), [leaveRoom:452-455](file://functions/_middleware.js#L452-L455)
- Frontend polling: [startOpponentPolling:1170-1194](file://game.js#L1170-L1194), [startMovePolling:1203-1227](file://game.js#L1203-L1227)

**Section sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [_middleware.js:353-443](file://functions/_middleware.js#L353-L443)
- [_middleware.js:445-477](file://functions/_middleware.js#L445-L477)
- [_middleware.js:499-516](file://functions/_middleware.js#L499-L516)
- [_middleware.js:522-683](file://functions/_middleware.js#L522-L683)
- [_middleware.js:685-707](file://functions/_middleware.js#L685-L707)
- [game.js:1170-1227](file://game.js#L1170-L1227)

## Architecture Overview
The backend uses a single-threaded Pages Function per request plus per-instance in-memory connection map for WebSocket clients. Database operations are executed synchronously per request or within a batch. Optimistic concurrency control is enforced at the game state table using a monotonically increasing counter.

```mermaid
sequenceDiagram
participant FE as "Frontend (game.js)"
participant WS as "WebSocket Server (_middleware.js)"
participant DB as "D1 Database"
FE->>WS : "createRoom(roomName)"
WS->>DB : "INSERT rooms, INSERT game_state, INSERT players (batch)"
DB-->>WS : "OK"
WS-->>FE : "roomCreated"
FE->>WS : "joinRoom(roomId)"
WS->>DB : "UPDATE rooms SET black_player_id,status<br/>INSERT players (batch)"
DB-->>WS : "OK"
WS-->>FE : "roomJoined"
FE->>WS : "move(from,to,roomId)"
WS->>DB : "SELECT game_state (move_count)"
WS->>DB : "UPDATE game_state WHERE room_id AND move_count=? (optimistic lock)"
DB-->>WS : "changes=1 or 0"
alt success
WS-->>FE : "moveConfirmed"
else conflict
WS-->>FE : "moveRejected"
end
FE->>WS : "getGameState(roomId)"
WS->>DB : "SELECT game_state"
DB-->>WS : "board,current_turn,move_count,last_move"
WS-->>FE : "gameState"
FE->>WS : "leaveRoom(roomId)"
WS->>DB : "UPDATE players SET connected=0,last_seen"
WS->>DB : "DELETE players/game_state/rooms (cleanup if empty)"
DB-->>WS : "OK"
WS-->>FE : "leftRoom"
```

**Diagram sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [_middleware.js:353-443](file://functions/_middleware.js#L353-L443)
- [_middleware.js:522-683](file://functions/_middleware.js#L522-L683)
- [_middleware.js:685-707](file://functions/_middleware.js#L685-L707)
- [_middleware.js:445-477](file://functions/_middleware.js#L445-L477)
- [_middleware.js:499-516](file://functions/_middleware.js#L499-L516)

## Detailed Component Analysis

### Database Schema and Indexes
- rooms: Unique room name, timestamps, player IDs, and status.
- game_state: Board representation, turn, last move, move count, status, and updated timestamp.
- players: Player-to-room foreign key, color, connection state, and last seen.
- Indexes: Name/status on rooms, room_id on players, updated_at on game_state.

```mermaid
erDiagram
ROOMS {
text id PK
text name UK
int created_at
text red_player_id
text black_player_id
text status
}
PLAYERS {
text id PK
text room_id FK
text color
int connected
int last_seen
}
GAME_STATE {
text room_id PK
text board
text current_turn
text last_move
int move_count
text status
int updated_at
}
ROOMS ||--o{ PLAYERS : "has"
ROOMS ||--|| GAME_STATE : "has"
```

**Diagram sources**
- [schema.sql:5-41](file://schema.sql#L5-L41)

**Section sources**
- [schema.sql:5-41](file://schema.sql#L5-L41)

### Room Creation (CRUD)
- Validates room name, checks for duplicates, cleans stale rooms if needed, and inserts three records atomically using a batch.
- Sets initial game state with an empty board and move count zero.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant WS as "_middleware.js"
participant DB as "D1"
FE->>WS : "createRoom(roomName)"
WS->>DB : "SELECT rooms WHERE name=?"
alt exists
WS->>DB : "checkRoomStale AND cleanupRoom if stale"
end
WS->>DB : "INSERT rooms (waiting)"
WS->>DB : "INSERT game_state (initial state)"
WS->>DB : "INSERT players (red)"
DB-->>WS : "OK"
WS-->>FE : "roomCreated"
```

**Diagram sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [_middleware.js:479-497](file://functions/_middleware.js#L479-L497)
- [_middleware.js:499-505](file://functions/_middleware.js#L499-L505)

**Section sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [_middleware.js:479-516](file://functions/_middleware.js#L479-L516)

### Room Join (CRUD)
- Finds room by ID or name, validates capacity and status, then updates room with black player and inserts player record in a batch.
- Notifies the first player and broadcasts to the room.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant WS as "_middleware.js"
participant DB as "D1"
FE->>WS : "joinRoom(roomId)"
WS->>DB : "SELECT rooms WHERE id=? OR name=?"
WS->>DB : "UPDATE rooms SET black_player_id='?', status='playing'"
WS->>DB : "INSERT players (black)"
DB-->>WS : "OK"
WS-->>FE : "roomJoined"
WS-->>FE : "broadcast playerJoined"
```

**Diagram sources**
- [_middleware.js:353-443](file://functions/_middleware.js#L353-L443)

**Section sources**
- [_middleware.js:353-443](file://functions/_middleware.js#L353-L443)

### Room Leave and Cleanup (CRUD)
- Marks player as disconnected and updates last seen.
- Broadcasts departure and triggers cleanup if no connected players remain.

```mermaid
flowchart TD
Start(["Leave Room"]) --> Update["UPDATE players SET connected=0,last_seen=?"]
Update --> Broadcast["Broadcast playerLeft"]
Broadcast --> Count["SELECT COUNT(players) WHERE room_id=? AND connected=1"]
Count --> Empty{"Count == 0 ?"}
Empty --> |Yes| Cleanup["DELETE players/game_state/rooms"]
Empty --> |No| Done(["Done"])
Cleanup --> Done
```

**Diagram sources**
- [_middleware.js:445-477](file://functions/_middleware.js#L445-L477)
- [_middleware.js:507-516](file://functions/_middleware.js#L507-L516)

**Section sources**
- [_middleware.js:445-477](file://functions/_middleware.js#L445-L477)
- [_middleware.js:507-516](file://functions/_middleware.js#L507-L516)

### Game State Retrieval (Read)
- Retrieves board, current turn, move count, and last move for a room.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant WS as "_middleware.js"
participant DB as "D1"
FE->>WS : "getGameState(roomId)"
WS->>DB : "SELECT game_state WHERE room_id=?"
DB-->>WS : "board,current_turn,move_count,last_move"
WS-->>FE : "gameState"
```

**Diagram sources**
- [_middleware.js:685-707](file://functions/_middleware.js#L685-L707)

**Section sources**
- [_middleware.js:685-707](file://functions/_middleware.js#L685-L707)

### Move Handling and Optimistic Concurrency Control
- Reads current game state including move_count.
- Validates turn and move legality.
- Updates board, turn, last_move, status, move_count, and updated_at.
- Uses a conditional UPDATE with WHERE clause matching the expected move_count to detect conflicts.
- On conflict, rejects the move and instructs the client to refresh.

```mermaid
flowchart TD
Enter(["Handle Move"]) --> Load["SELECT board,current_turn,move_count,status"]
Load --> CheckStatus{"status == 'finished'?"}
CheckStatus --> |Yes| Reject["Reject: GAME_OVER"]
CheckStatus --> |No| ValidateTurn["Validate player color and current_turn"]
ValidateTurn --> Legal{"Move legal?"}
Legal --> |No| Reject["Reject: INVALID_MOVE"]
Legal --> |Yes| Apply["Compute new state (board,turn,last_move,status)"]
Apply --> Inc["new_move_count = expected_move_count + 1"]
Inc --> Update["UPDATE game_state WHERE room_id AND move_count=expected"]
Update --> Conflict{"changes == 0?"}
Conflict --> |Yes| Reject["Reject: Concurrent move detected"]
Conflict --> |No| Touch["UPDATE players SET last_seen=?"]
Touch --> Finish(["Confirm and broadcast"])
```

**Diagram sources**
- [_middleware.js:522-683](file://functions/_middleware.js#L522-L683)

**Section sources**
- [_middleware.js:522-683](file://functions/_middleware.js#L522-L683)

### Player Connection Updates
- On move: update last_seen for the moving player.
- On leave: mark player disconnected and update last_seen.

```mermaid
sequenceDiagram
participant WS as "_middleware.js"
participant DB as "D1"
WS->>DB : "UPDATE players SET last_seen=? WHERE id=?"
WS->>DB : "UPDATE players SET connected=0,last_seen=? WHERE id=?"
```

**Diagram sources**
- [_middleware.js:636-638](file://functions/_middleware.js#L636-L638)
- [_middleware.js:452-455](file://functions/_middleware.js#L452-L455)

**Section sources**
- [_middleware.js:636-638](file://functions/_middleware.js#L636-L638)
- [_middleware.js:452-455](file://functions/_middleware.js#L452-L455)

### Stale Room Detection and Cleanup
- A room is stale if it has no players or if all players are both disconnected and inactive beyond a timeout threshold.
- Cleanup removes all related records for the room.

```mermaid
flowchart TD
S(["Check Stale"]) --> C1["COUNT players WHERE room_id AND connected=1"]
C1 --> C2["COUNT players WHERE room_id AND last_seen > now - timeout"]
C2 --> C3["COUNT players WHERE room_id"]
C3 --> Decide{"total==0 OR (connected==0 AND recent==0)?"}
Decide --> |Yes| Clean["DELETE players/game_state/rooms"]
Decide --> |No| Keep["Keep room"]
```

**Diagram sources**
- [_middleware.js:479-497](file://functions/_middleware.js#L479-L497)
- [_middleware.js:499-505](file://functions/_middleware.js#L499-L505)

**Section sources**
- [_middleware.js:479-497](file://functions/_middleware.js#L479-L497)
- [_middleware.js:499-505](file://functions/_middleware.js#L499-L505)

### Frontend Real-time Update Strategies
- Heartbeat: periodic ping/pong to keep the connection alive.
- Polling: periodically checks for opponent presence and pending moves when WebSocket is unavailable or lagging.
- Rejoin: re-establishes state after reconnection.

```mermaid
sequenceDiagram
participant FE as "Frontend (game.js)"
participant WS as "_middleware.js"
loop Every ~2s
FE->>WS : "checkOpponent(roomId)"
end
loop Every ~3s
FE->>WS : "checkMoves(roomId,lastKnownUpdate)"
end
FE->>WS : "rejoin(roomId,color)"
WS-->>FE : "rejoined(board,currentTurn,moveCount)"
```

**Diagram sources**
- [game.js:1170-1227](file://game.js#L1170-L1227)
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)

**Section sources**
- [game.js:842-882](file://game.js#L842-L882)
- [game.js:1170-1227](file://game.js#L1170-L1227)
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)

## Dependency Analysis
- The middleware depends on D1 for all persistence operations and uses prepared statements with bound parameters.
- Batch operations are used to maintain atomicity for multi-table inserts during room creation/join.
- The frontend depends on the WebSocket endpoint for real-time updates and falls back to polling when needed.

```mermaid
graph LR
FE["game.js"] --> WS["functions/_middleware.js"]
WS --> D1["D1 (SQLite)"]
D1 --> Rooms["rooms"]
D1 --> Players["players"]
D1 --> GameState["game_state"]
```

**Diagram sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [schema.sql:5-41](file://schema.sql#L5-L41)

**Section sources**
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [schema.sql:5-41](file://schema.sql#L5-L41)

## Performance Considerations
- Indexes: Name/status on rooms, room_id on players, updated_at on game_state improve query performance for frequent lookups.
- Prepared statements: All queries use parameter binding to avoid SQL injection and enable plan reuse.
- Batch writes: Multi-table inserts are grouped to reduce round-trips.
- Stale room cleanup: Prevents accumulation of orphaned data.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Database not configured: Ensure the D1 binding is present in the environment.
- Room creation failure: Validate room name uniqueness and staleness checks.
- Move rejected due to concurrency: Client should refresh state and retry.
- Stale room not cleaned: Verify stale detection logic and timeouts.
- Polling fallback: Enable polling when WebSocket is unavailable.

**Section sources**
- [_middleware.js:13-40](file://functions/_middleware.js#L13-L40)
- [_middleware.js:282-351](file://functions/_middleware.js#L282-L351)
- [_middleware.js:522-683](file://functions/_middleware.js#L522-L683)
- [_middleware.js:479-516](file://functions/_middleware.js#L479-L516)
- [game.js:1170-1227](file://game.js#L1170-L1227)

## Conclusion
The application employs straightforward, parameterized SQL with prepared statements and batch operations to maintain consistency. Optimistic concurrency control prevents race conditions on game state updates. Stale room detection and cleanup keep the database tidy. The frontend uses a combination of WebSocket events and polling to achieve robust real-time behavior.