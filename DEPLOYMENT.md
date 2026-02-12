
# Deployment Guide - Cloudflare Pages

This guide explains how to deploy the Chinese Chess game with dynamic multiplayer functionality to Cloudflare Pages.

## Architecture

```
┌─────────────────┐
│   Frontend      │  (Static HTML/CSS/JS)
│   (Pages)       │
└────────┬────────┘
         │
         │ WebSocket
         │
┌────────▼────────┐
│   Backend       │  (Cloudflare Pages Functions)
│   (Functions)   │  - Handles WebSocket connections
└─────────────────┘  - Manages game state
                      - Real-time communication
```

## Why Cloudflare Pages Functions?

Since this project requires real-time multiplayer functionality with WebSockets, we need a backend server. Cloudflare Pages Functions provides:

- **Edge Computing**: Runs close to users worldwide
- **WebSocket Support**: Full support for real-time bidirectional communication
- **Serverless**: No server management needed
- **Integrated**: Works seamlessly with Cloudflare Pages
- **Free Tier**: Generous free tier for development

## Deployment Steps

### Option 1: Deploy via Cloudflare Dashboard (Recommended)

#### Step 1: Create Cloudflare Account
1. Go to https://dash.cloudflare.com/sign-up
2. Create a free account

#### Step 2: Connect GitHub Repository
1. Go to **Workers & Pages** → **Create Application**
2. Select **Pages** → **Connect to Git**
3. Authorize Cloudflare to access your GitHub
4. Select `XiaoLi-s-Chinese-Chess` repository

#### Step 3: Configure Build Settings
```
Framework preset: Vite
Build command: npm run build
Build output directory: public
```

#### Step 4: Deploy
1. Click **Save and Deploy**
2. Wait for deployment to complete (usually 1-2 minutes)
3. Your site will be live at `https://your-project.pages.dev`

### Option 2: Deploy via Wrangler CLI

#### Step 1: Install Wrangler
```bash
npm install -g wrangler
```

#### Step 2: Login to Cloudflare
```bash
wrangler login
```

#### Step 3: Create Pages Project
```bash
wrangler pages project create xiaoli-chinese-chess
```

#### Step 4: Deploy
```bash
npm run build
wrangler pages deploy public --project-name=xiaoli-chinese-chess
```

## Important Notes

### WebSocket Support
Cloudflare Pages Functions supports WebSockets through the `WebSocketPair` API. The implementation is in:
- `functions/_middleware.js` - Routes WebSocket requests
- `functions/ws/index.js` - Handles WebSocket connections and game logic

### Current Limitations
The current implementation uses **in-memory storage** which means:
- Game state is lost when the worker restarts
- Works fine for testing and small-scale usage
- For production, consider using:
  - **Cloudflare D1** (SQLite database)
  - **Cloudflare Workers KV** (Key-value storage)
  - **Cloudflare Durable Objects** (Stateful objects)

### Production Upgrade Path

For production deployment with persistent storage, you would:

1. **Create a D1 Database**:
```bash
wrangler d1 create chinese-chess-db
```

2. **Update wrangler.toml**:
```toml
[[d1_databases]]
binding = "DB"
database_name = "chinese-chess-db"
database_id = "your-database-id"
```

3. **Use Durable Objects** for stateful game sessions

## Testing the Deployment

1. **Open your deployed site**
2. **Create a room** on one device
3. **Copy the Room ID**
4. **Join the room** on another device
5. **Start playing!**

## Troubleshooting

### WebSocket Connection Fails
- Check that `functions/_middleware.js` is correctly routing `/ws` requests
- Ensure WebSocket upgrade headers are properly handled
- Check browser console for errors

### Build Fails
- Ensure all dependencies are in `package.json`
- Check that `vite.config.js` output directory is `public`
- Verify build command: `npm run build`

### Rooms Not Working
- Check that `functions/ws/index.js` is deployed
- Verify WebSocket connections are being accepted
- Check browser console for WebSocket errors

## Environment Variables

For production, you might want to add:
- `DATABASE_URL` (if using external database)
- `API_SECRET_KEY` (for authentication)
- `MAX_ROOMS` (limit concurrent games)

## Custom Domain

To use a custom domain:
1. Go to your Pages project in Cloudflare Dashboard
2. Click **Custom Domains**
3. Add your domain
4. Update DNS records as instructed

## Monitoring

Monitor your deployment:
- **Analytics**: View in Cloudflare Dashboard
- **Logs**: Check Workers logs for errors
- **Real Users**: Use Cloudflare Web Analytics

## Cost

- **Free Tier**: Includes 100,000 requests/day
- **WebSocket**: Included in free tier
- **Paid Plans**: Start at $5/month for higher limits

## Next Steps

1. ✅ Deploy to Cloudflare Pages
2. ✅ Test multiplayer functionality
3. 🔧 Add persistent storage (D1/Durable Objects)
4. 🔧 Add user authentication
5. 🔧 Add game replay feature
6. 🔧 Add ranking/leaderboard system
