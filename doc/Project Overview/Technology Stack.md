# Technology Stack

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [wrangler.toml](file://wrangler.toml)
- [index.html](file://index.html)
- [game.js](file://game.js)
- [style.css](file://style.css)
- [functions/_middleware.js](file://functions/_middleware.js)
- [schema.sql](file://schema.sql)
- [DEPLOYMENT.md](file://DEPLOYMENT.md)
- [README.md](file://README.md)
- [vite.config.js](file://vite.config.js)
- [tests/integration/websocket.test.js](file://tests/integration/websocket.test.js)
- [tests/unit/chess-rules.test.js](file://tests/unit/chess-rules.test.js)
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
This document describes the technology stack powering the Chinese Chess Online project. It covers frontend technologies (HTML5, CSS3, Vanilla JavaScript), backend architecture (Cloudflare Pages Functions with WebSocket support), database solution (Cloudflare D1 with SQLite), and deployment platform (Cloudflare Pages). It explains the rationale behind each choice, integration patterns, and how the stack enables real-time multiplayer functionality. Version requirements, compatibility considerations, and performance characteristics are included for both developers and users.

## Project Structure
The project follows a clear separation of concerns:
- Frontend assets (HTML, CSS, JavaScript) are built and served statically via Cloudflare Pages.
- Real-time multiplayer logic is implemented in Cloudflare Pages Functions with WebSocket support.
- Game state is persisted using Cloudflare D1 (SQLite).
- Build and deployment are orchestrated via Vite and Wrangler.

```mermaid
graph TB
subgraph "Frontend"
HTML["index.html"]
CSS["style.css"]
JS["game.js"]
end
subgraph "Backend"
MW["functions/_middleware.js"]
D1["Cloudflare D1 (SQLite)"]
end
subgraph "Deployment"
CFPages["Cloudflare Pages"]
CFWorkers["Cloudflare Workers"]
end
HTML --> CFPages
CSS --> CFPages
JS --> CFPages
CFPages --> CFWorkers
CFWorkers --> MW
MW --> D1
```

**Diagram sources**
- [index.html](file://index.html)
- [style.css](file://style.css)
- [game.js](file://game.js)
- [functions/_middleware.js](file://functions/_middleware.js)
- [schema.sql](file://schema.sql)

**Section sources**
- [README.md](file://README.md)
- [vite.config.js](file://vite.config.js)
- [wrangler.toml](file://wrangler.toml)

## Core Components
- Frontend: HTML5 semantic markup, CSS3 animations and responsive design, Vanilla JavaScript for game logic and WebSocket communication.
- Backend: Cloudflare Pages Functions handling WebSocket upgrades, room management, move validation, and broadcasting.
- Database: Cloudflare D1 (SQLite) for persistent room, game state, and player metadata.
- Build and Dev Tools: Vite for development server and bundling; Wrangler for local development and deployment; Vitest for testing.

**Section sources**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [vite.config.js](file://vite.config.js)
- [wrangler.toml](file://wrangler.toml)

## Architecture Overview
The system uses a static-first architecture with dynamic WebSocket-backed multiplayer:
- Cloudflare Pages serves the static frontend.
- Incoming WebSocket connections are routed to Cloudflare Pages Functions via the middleware.
- Functions manage rooms, validate moves, persist state to D1, and broadcast updates to both players.
- The frontend renders the board, handles user interactions, and synchronizes with the backend via WebSocket.

```mermaid
sequenceDiagram
participant Client as "Browser (game.js)"
participant Pages as "Cloudflare Pages"
participant Func as "functions/_middleware.js"
participant D1 as "Cloudflare D1"
Client->>Pages : GET index.html, style.css, game.js
Pages-->>Client : 200 Static assets
Client->>Func : WebSocket upgrade to /ws
Func-->>Client : 101 Switching Protocols
Client->>Func : JSON {type : "createRoom"/"joinRoom"/"move"}
Func->>D1 : Read/Write game state
D1-->>Func : Persisted data
Func-->>Client : JSON {type : "roomCreated"/"roomJoined"/"moveConfirmed"}
Func-->>Client : Broadcast move to opponent
```

**Diagram sources**
- [functions/_middleware.js](file://functions/_middleware.js)
- [game.js](file://game.js)
- [schema.sql](file://schema.sql)

**Section sources**
- [DEPLOYMENT.md](file://DEPLOYMENT.md)
- [functions/_middleware.js](file://functions/_middleware.js)

## Detailed Component Analysis

### Frontend: HTML5, CSS3, Vanilla JavaScript
- HTML5 defines screens for lobby and game, with semantic elements and viewport meta for responsiveness.
- CSS3 provides responsive layouts, animations (e.g., pulsing check indicator), and adaptive styles for mobile.
- Vanilla JavaScript implements:
  - Board initialization and rendering with SVG-like DOM elements.
  - Piece selection, valid move calculation, and move execution.
  - WebSocket connection lifecycle, heartbeat, reconnection, and error handling.
  - UI updates for game state, turn indicators, and messages.

```mermaid
flowchart TD
Start(["User selects piece"]) --> Calc["Compute valid moves"]
Calc --> Valid{"Is destination valid?"}
Valid --> |No| Render["Render board with highlights"]
Valid --> |Yes| Apply["Apply move locally (optimistic)"]
Apply --> Send["Send move via WebSocket"]
Send --> Ack{"Received confirmation?"}
Ack --> |Yes| Sync["Sync with server state"]
Ack --> |No| Rollback["Rollback local change"]
Sync --> End(["Turn ends"])
Rollback --> End
```

**Diagram sources**
- [game.js](file://game.js)

**Section sources**
- [index.html](file://index.html)
- [style.css](file://style.css)
- [game.js](file://game.js)

### Backend: Cloudflare Pages Functions with WebSocket
- Middleware routes WebSocket requests to the WebSocket handler and serves static files otherwise.
- WebSocket handler accepts connections, manages heartbeats, and dispatches messages to handlers for room creation/joining, moves, resign, and reconnection.
- Room management persists room metadata, assigns colors, tracks connectivity, and cleans up stale rooms.
- Move validation mirrors frontend rules and uses optimistic locking to prevent race conditions.
- Broadcasting ensures both players receive updates in real time.

```mermaid
classDiagram
class Middleware {
+onRequest(context) Response
+handleWebSocket(context) Response
}
class WSHandler {
+setupHeartbeat(ws, id)
+handleMessage(ws, data, id, env)
+broadcastToRoom(roomId, msg, exclude)
}
class RoomOps {
+createRoom(ws, name, id, db)
+joinRoom(ws, id, db)
+leaveRoom(ws, id, db)
+cleanupRoom(roomId, db)
}
class GameOps {
+handleMove(ws, data, id, db)
+handleResign(ws, id, db)
+handleGetGameState(ws, id, db)
}
Middleware --> WSHandler : "routes /ws"
WSHandler --> RoomOps : "calls"
WSHandler --> GameOps : "calls"
```

**Diagram sources**
- [functions/_middleware.js](file://functions/_middleware.js)

**Section sources**
- [functions/_middleware.js](file://functions/_middleware.js)

### Database: Cloudflare D1 (SQLite)
- Schema defines three tables: rooms, game_state, and players, with foreign keys and indexes for performance.
- Initialization is idempotent and executed on every request to ensure schema readiness.
- Operations include:
  - Room creation with initial board and game state.
  - Player assignment and connectivity tracking.
  - Move persistence with optimistic locking using move_count.
  - Cleanup of stale rooms and players.

```mermaid
erDiagram
ROOMS {
text id PK
text name UK
integer created_at
text red_player_id
text black_player_id
text status
}
GAME_STATE {
text room_id PK
text board
text current_turn
text last_move
integer move_count
text status
integer updated_at
}
PLAYERS {
text id PK
text room_id FK
text color
integer connected
integer last_seen
}
ROOMS ||--o{ GAME_STATE : "has"
ROOMS ||--o{ PLAYERS : "hosts"
```

**Diagram sources**
- [schema.sql](file://schema.sql)

**Section sources**
- [schema.sql](file://schema.sql)
- [functions/_middleware.js](file://functions/_middleware.js)

### Build and Deployment: Vite, Wrangler, Pages
- Vite builds static assets to the public directory and runs a dev server.
- Wrangler manages local development with Pages dev, D1 bindings, and deployment to Cloudflare Pages.
- Deployment targets Pages with a build command and output directory configured in wrangler.toml.

```mermaid
flowchart TD
Dev["npm run dev:local"] --> PagesDev["wrangler pages dev public"]
Build["npm run build"] --> Out["public/"]
Deploy["npm run deploy"] --> PagesDeploy["wrangler pages deploy public"]
PagesDev --> D1Init["Initialize D1 schema"]
PagesDeploy --> D1Init
```

**Diagram sources**
- [package.json](file://package.json)
- [vite.config.js](file://vite.config.js)
- [wrangler.toml](file://wrangler.toml)

**Section sources**
- [package.json](file://package.json)
- [vite.config.js](file://vite.config.js)
- [wrangler.toml](file://wrangler.toml)
- [DEPLOYMENT.md](file://DEPLOYMENT.md)

## Dependency Analysis
- Frontend depends on browser APIs (DOM, WebSocket) and Cloudflare-hosted static assets.
- Backend depends on Cloudflare runtime APIs (WebSocketPair, D1 binding) and the database schema.
- Build pipeline depends on Vite and Wrangler for local development and deployment automation.

```mermaid
graph LR
game_js["game.js"] --> ws_api["WebSocket API"]
game_js --> dom_api["DOM/CSSOM"]
functions_mw["_middleware.js"] --> d1_api["D1 binding"]
functions_mw --> ws_pair["WebSocketPair"]
vite_cfg["vite.config.js"] --> build_out["public/"]
pkg_json["package.json"] --> vite_dev["Vite dev/build"]
pkg_json --> wrangler_cli["Wrangler CLI"]
wrangler_cfg["wrangler.toml"] --> pages_deploy["Pages deployment"]
```

**Diagram sources**
- [game.js](file://game.js)
- [functions/_middleware.js](file://functions/_middleware.js)
- [vite.config.js](file://vite.config.js)
- [package.json](file://package.json)
- [wrangler.toml](file://wrangler.toml)

**Section sources**
- [game.js](file://game.js)
- [functions/_middleware.js](file://functions/_middleware.js)
- [vite.config.js](file://vite.config.js)
- [package.json](file://package.json)
- [wrangler.toml](file://wrangler.toml)

## Performance Considerations
- Edge computing: Cloudflare’s global edge minimizes latency for multiplayer interactions.
- WebSocket efficiency: Heartbeat and periodic ping/pong keep connections alive and detect failures quickly.
- Optimistic UI updates: The frontend applies moves immediately and reconciles with server confirmation, reducing perceived latency.
- Database indexing: Indexes on frequently queried columns improve room and player lookup performance.
- Static hosting: Pages delivers HTML/CSS/JS efficiently, keeping bandwidth and CPU usage low for the client.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- WebSocket connection fails: Verify the middleware routes /ws and the upgrade header is handled. Check browser console for errors.
- Build fails: Ensure the build command and output directory match configuration. Confirm dependencies in package.json.
- Rooms not working: Confirm the WebSocket handler is deployed and connections are accepted. Check for WebSocket errors in the browser console.
- Database errors: Confirm D1 binding is configured and schema initialization runs on every request.

**Section sources**
- [DEPLOYMENT.md](file://DEPLOYMENT.md)
- [functions/_middleware.js](file://functions/_middleware.js)

## Conclusion
The Chinese Chess Online project leverages a modern, serverless stack to deliver a responsive, real-time multiplayer experience. The combination of static hosting, WebSocket-backed backend, and a lightweight database provides scalability, low latency, and ease of deployment. The stack balances simplicity for developers with strong performance characteristics for users, while offering clear upgrade paths to persistent storage and advanced features.