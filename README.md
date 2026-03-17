
# Chinese Chess Online (中国象棋)

A multiplayer Chinese Chess game that runs on Cloudflare Pages with WebSocket support for real-time multiplayer gameplay.

## Features

- **Full Chinese Chess Rules**: Complete implementation of all piece movements including:
  - 將/帥
  - 士/仕
  - 象/相
  - 馬
  - 車
  - 炮/砲
  - 卒/兵
- **Game Rule Validation**: Automatic check detection, checkmate detection, and flying general rule
- **Multiplayer Support**: Play with friends in real-time using WebSockets
- **Room System**: Create or join game rooms
- **Reconnection Support**: Automatic reconnection with game state recovery
- **Responsive Design**: Works on both desktop and mobile devices
- **Cloudflare Pages Hosting**: Fast, global deployment with D1 database

## Quick Start

### Option 1: Local Development (Recommended)

1. **Run the setup script** (automated):
```bash
chmod +x scripts/local-dev-setup.sh
./scripts/local-dev-setup.sh
```

Or manually:

```bash
# Install dependencies
npm install

# Initialize local D1 database
npm run db:init

# Build frontend
npm run build

# Start local development server
npm run dev:local
```

2. Open your browser to `http://localhost:8788`

### Option 2: Frontend Only Development

For frontend-only development without backend:

```bash
npm install
npm run dev
```

Open your browser to `http://localhost:5173`

### Option 3: Deploy to Cloudflare

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Create D1 Database:
```bash
wrangler d1 create chinachess
```

4. Update `wrangler.toml` with your database ID

5. Initialize database:
```bash
npm run db:init:remote
```

6. Deploy:
```bash
npm run deploy
```

## How to Play

1. **Create a Room**: Enter a room name and click "Create Room"
2. **Share Room ID**: Copy the room ID and share it with your friend
3. **Join a Room**: Your friend enters the room ID and clicks "Join Room"
4. **Start Playing**: Red moves first, take turns moving pieces
5. **Win**: Capture the opponent's 將/帥 to win!

## Controls

- **Click a piece** to select it and see valid moves
- **Click a valid position** to move the selected piece
- Valid moves are shown as blue dots

## Game Rules

### Piece Movements

- **將/帥**: Moves one step horizontally or vertically within the palace (3x3 grid). Can capture opponent's 將/帥 if no pieces are between them (flying general rule)
- **士/仕**: Moves one step diagonally within the palace
- **象/相**: Moves two steps diagonally, cannot cross the river, and can be blocked
- **馬**: Moves in an "L" shape, can be blocked if the adjacent position is occupied
- **車**: Moves any number of steps horizontally or vertically
- **炮/砲**: Moves like 車, but must jump over exactly one piece to capture
- **卒/兵**: Moves one step forward before crossing the river, can also move sideways after crossing

### Special Rules

- **Flying General**: The two 將/帥 cannot face each other on the same file without pieces between them
- **Blocking**: 馬's movement can be blocked, 象/相's movement can be blocked
- **River Crossing**: 象/相 cannot cross the river, 卒/兵 gain sideways movement after crossing

## Testing

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Test Structure
```
tests/
├── setup.js                    # Test environment setup and mocks
├── unit/
│   ├── chess-rules.test.js     # Chess rules validation tests
│   ├── board.test.js           # Board logic tests
│   └── game-state.test.js      # Game state management tests
└── integration/
    ├── websocket.test.js       # WebSocket communication tests
    └── database.test.js        # Database operation tests
```

## Technical Details

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Cloudflare Pages Functions with WebSocket support
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages
- **Build Tool**: Vite
- **Testing**: Vitest

## Project Structure

```
├── functions/
│   └── _middleware.js          # Backend logic (WebSocket, game rules, database)
├── public/                     # Static files (built from index.html, style.css)
├── game.js                     # Frontend game logic
├── index.html                  # Main HTML file
├── style.css                   # Styles
├── schema.sql                  # Database schema
├── vitest.config.js            # Test configuration
├── wrangler.toml               # Cloudflare configuration
└── tests/                      # Test files
```

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT License
