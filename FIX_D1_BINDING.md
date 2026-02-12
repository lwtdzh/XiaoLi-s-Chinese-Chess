# How to Fix "Database not configured" Error

## The Problem

You're seeing this error because the D1 database is not bound to your Cloudflare Pages project. Even though the database exists, the Pages Functions can't access it without a binding.

## Solution: Configure D1 Binding in Cloudflare Pages

### Step 1: Go to Cloudflare Dashboard

1. Visit [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Log in to your account

### Step 2: Navigate to Your Pages Project

1. Click on **"Workers & Pages"** in the left sidebar
2. Find and click on your Chinese Chess project

### Step 3: Access Functions Settings

1. Click on the **"Settings"** tab at the top
2. Click on **"Functions"** in the left menu

### Step 4: Add D1 Binding

1. Scroll down to "D1 database bindings" section
2. Click "Add binding" button
3. Fill in:
   - Variable name: `DB` (must be exactly this, uppercase)
   - D1 database: Select `chinachess` (your database)
4. Click "Save"

### Step 5: Deploy the Changes

1. Click **"Save and Deploy"** button
2. Wait for the deployment to complete (1-2 minutes)

### Step 6: Test

1. Refresh your website
2. Try creating a room again
3. It should work now! ✅

## Verification

To verify the binding is working:

### Check in Dashboard:

1. Go to your Pages project → Settings → Functions
2. Under "D1 database bindings", you should see:
   - Variable name: `DB`
   - D1 database: `chinese_chess_db`

### Check in Browser:

1. Open your website
2. Open Developer Tools (F12)
3. Go to Console tab
4. Try creating a room
5. You should see success messages instead of errors

## What This Does

The D1 binding connects your Pages Functions to the database:

```
Pages Functions (functions/_middleware.js)
    ↓
Uses: context.env.DB
    ↓
Connected to: chinese_chess_db
    ↓
Can now: Read/Write rooms, game_state, players
```

## Common Mistakes

### ❌ Wrong Variable Name
- **Incorrect**: `db`, `Database`, `DATABASE`
- **Correct**: `DB` (uppercase)

### ❌ Wrong Database
- Make sure you select `chinese_chess_db`, not a different database

### ❌ Forgot to Deploy
- After adding the binding, you must click "Save and Deploy"

### ❌ Database Doesn't Exist
- Make sure you created the database first (see SETUP_D1_DASHBOARD.md)

## Troubleshooting

### Still getting "Database not configured"?

1. **Check the binding name**:
   - Must be exactly `DB` (uppercase)
   - Go to Settings → Functions → D1 bindings
   - Verify "Variable name" is `DB`

2. **Check database exists**:
   - Go to Workers & Pages → D1
   - Make sure `chinese_chess_db` exists

3. **Redeploy**:
   - Sometimes you need to redeploy
   - Go to your Pages project
   - Click "Deployments" → "Retry deployment"

4. **Check logs**:
   - Go to Functions → Logs
   - Look for database-related errors

## Quick Reference

| Step | Action |
|------|--------|
| 1 | Go to Pages project settings |
| 2 | Click Functions |
| 3 | Add D1 binding |
| 4 | Variable name: `DB` |
| 5 | Select `chinese_chess_db` |
| 6 | Save and Deploy |
| 7 | Test |

## Complete Setup Checklist

Before the game will work, you need:

- [x] D1 database created (`chinese_chess_db`)
- [x] Database ID in `wrangler.toml`
- [ ] **D1 binding configured (THIS IS WHAT YOU NEED TO DO NOW)**
- [ ] Project deployed
- [ ] Test creating a room

## What Happens After You Fix It

Once you configure the D1 binding:

1. **Database auto-initializes** on first visit
2. **Room creation works** immediately
3. **Multiplayer works** across devices
4. **Game state persists** in database

## Need Help?

If you're still stuck:

1. Check Cloudflare Dashboard → Pages → Settings → Functions → D1 bindings
2. Verify "Variable name" is exactly `DB`
3. Verify database is `chinese_chess_db`
4. Make sure you clicked "Save and Deploy"

The error "Database not configured" will disappear once the binding is set up correctly!
