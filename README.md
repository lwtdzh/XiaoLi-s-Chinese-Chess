
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
- **Multiplayer Support**: Play with friends in real-time using WebSockets
- **Room System**: Create or join game rooms
- **Responsive Design**: Works on both desktop and mobile devices
- **Cloudflare Pages Hosting**: Fast, global deployment

## Quick Start

### Option 1: Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:5173`

### Option 2: Deploy to Cloudflare

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Deploy:
```bash
wrangler pages deploy public
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

## Technical Details

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Cloudflare Workers with WebSocket support
- **Hosting**: Cloudflare Pages
- **Build Tool**: Vite

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT License
