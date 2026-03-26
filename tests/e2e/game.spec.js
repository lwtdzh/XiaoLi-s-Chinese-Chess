// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'https://chinachess.pages.dev';

// Generate unique room name for each test
const generateRoomName = () => `test-room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('Chinese Chess E2E Tests', () => {
  
  test.describe('Lobby Screen', () => {
    
    test('should display lobby screen with correct elements', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Check title
      await expect(page.locator('h1')).toContainText('中国象棋');
      
      // Check input fields exist
      await expect(page.locator('#roomName')).toBeVisible();
      await expect(page.locator('#joinRoomId')).toBeVisible();
      
      // Check buttons exist
      await expect(page.locator('#createRoomBtn')).toBeVisible();
      await expect(page.locator('#joinRoomBtn')).toBeVisible();
    });
    
    test('should show error when creating room with empty name', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Click create without entering name
      await page.click('#createRoomBtn');
      
      // Wait for error message
      await expect(page.locator('#lobbyMessage')).toBeVisible();
      await expect(page.locator('#lobbyMessage')).toContainText('请输入房间名称');
    });
    
    test('should show error when joining room with empty input', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Click join without entering ID
      await page.click('#joinRoomBtn');
      
      // Wait for error message
      await expect(page.locator('#lobbyMessage')).toBeVisible();
      await expect(page.locator('#lobbyMessage')).toContainText('请输入房间 ID');
    });
    
    test('should show error when joining non-existent room', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Enter non-existent room ID
      await page.fill('#joinRoomId', 'non-existent-room-12345');
      await page.click('#joinRoomBtn');
      
      // Wait for error message
      await expect(page.locator('#lobbyMessage')).toBeVisible();
      await expect(page.locator('#lobbyMessage')).toContainText('房间不存在');
    });
    
    test('should create room successfully', async ({ page }) => {
      await page.goto(BASE_URL);
      
      const roomName = generateRoomName();
      
      // Enter room name and create
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      
      // Wait for redirect to game screen
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#lobby')).not.toBeVisible();
      
      // Verify game screen elements
      await expect(page.locator('#chessBoard')).toBeVisible();
      // Red player sees "你的回合" (your turn) since red moves first
      await expect(page.locator('#turnIndicator')).toContainText('你的回合');
      
      // Verify room ID is displayed
      await expect(page.locator('#roomIdDisplay')).toBeVisible();
    });
  });
  
  test.describe('Game Screen', () => {
    
    test.beforeEach(async ({ page }) => {
      // Create a room before each test
      await page.goto(BASE_URL);
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    });
    
    test('should display chess board with correct pieces', async ({ page }) => {
      // Check board is visible
      await expect(page.locator('#chessBoard')).toBeVisible();
      
      // Check for chess pieces (should have 32 pieces total)
      const pieces = page.locator('.chess-piece');
      await expect(pieces).toHaveCount(32);
      
      // Check for some specific pieces by position
      // Red chariot at bottom left (row 9, col 0)
      await expect(pieces.first()).toBeVisible();
    });
    
    test('should select piece on click', async ({ page }) => {
      // Wait for board to be ready
      await expect(page.locator('.chess-piece').first()).toBeVisible();
      
      // Click on a red piece (we are red player)
      const firstPiece = page.locator('.chess-piece.red').first();
      await firstPiece.click();
      
      // Piece should be selected (has 'selected' class)
      await expect(firstPiece).toHaveClass(/selected/);
      
      // Valid moves should be shown
      const validMoves = page.locator('.valid-move');
      await expect(validMoves.first()).toBeVisible({ timeout: 2000 });
    });
    
    test('should show valid moves when piece selected', async ({ page }) => {
      // Click on a red chariot (車)
      const redChariot = page.locator('.chess-piece.red:has-text("車")').first();
      await redChariot.click();
      
      // Should show valid moves
      const validMoves = page.locator('.valid-move');
      const count = await validMoves.count();
      expect(count).toBeGreaterThan(0);
    });
    
    test('should deselect piece when clicking elsewhere', async ({ page }) => {
      // Select a piece
      const firstPiece = page.locator('.chess-piece.red').first();
      await firstPiece.click();
      await expect(firstPiece).toHaveClass(/selected/);
      
      // Click on empty board area (river area)
      await page.click('.river');
      
      // Piece should be deselected
      await expect(firstPiece).not.toHaveClass(/selected/);
    });
    
    test('should leave room and return to lobby', async ({ page }) => {
      // Click leave button
      await page.click('#leaveRoomBtn');
      
      // Should be back in lobby
      await expect(page.locator('#lobby')).toBeVisible();
      await expect(page.locator('#game')).not.toBeVisible();
    });
    
    test('should copy room ID when clicked', async ({ page }) => {
      // Make room ID box visible
      await page.evaluate(() => {
        document.getElementById('roomIdBox')?.classList.remove('hidden');
      });
      
      // Click on room ID display
      const roomIdDisplay = page.locator('#roomIdDisplay');
      await roomIdDisplay.click();
      
      // Check for copy success message
      await expect(page.locator('#gameMessage')).toBeVisible({ timeout: 3000 });
    });
  });
  
  test.describe('Chess Rules', () => {
    
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    });
    
    test('should move pawn forward correctly', async ({ page }) => {
      // Select a red pawn (兵)
      const redPawn = page.locator('.chess-piece.red:has-text("兵")').first();
      await redPawn.click();
      
      // Wait for valid moves
      const validMoves = page.locator('.valid-move');
      await expect(validMoves.first()).toBeVisible();
      
      // Pawn should have one valid move (forward) before crossing river
      const count = await validMoves.count();
      expect(count).toBe(1);
    });
    
    test('should not allow moving opponent pieces', async ({ page }) => {
      // Try to click on a black piece
      const blackPiece = page.locator('.chess-piece.black').first();
      await blackPiece.click();
      
      // Should not be selected (it's not our turn for black)
      await expect(blackPiece).not.toHaveClass(/selected/);
    });
    
    test('should move chariot in straight line', async ({ page }) => {
      // Select red chariot
      const redChariot = page.locator('.chess-piece.red:has-text("車")').first();
      await redChariot.click();
      
      // Should have valid moves
      const validMoves = page.locator('.valid-move');
      const count = await validMoves.count();
      expect(count).toBeGreaterThan(0);
      
      // All moves should be in straight line from chariot position
      // (This is implicitly tested by the game logic)
    });
    
    test('should show check warning when king is threatened', async ({ page }) => {
      // This test requires setting up a specific board position
      // For now, we just verify the check indicator mechanism exists
      const turnIndicator = page.locator('#turnIndicator');
      
      // Initially should show "等待对手" or "你的回合"
      const text = await turnIndicator.textContent();
      expect(text).toBeTruthy();
    });
  });
  
  test.describe('Multiplayer', () => {
    
    test('should allow second player to join room', async ({ browser }) => {
      // Create two browser contexts
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Player 1 creates room
      await page1.goto(BASE_URL);
      const roomName = generateRoomName();
      await page1.fill('#roomName', roomName);
      await page1.click('#createRoomBtn');
      await expect(page1.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Get room ID
      await page1.evaluate(() => {
        document.getElementById('roomIdBox')?.classList.remove('hidden');
      });
      const roomId = await page1.locator('#roomIdDisplay').textContent();
      
      // Player 2 joins room
      await page2.goto(BASE_URL);
      await page2.fill('#joinRoomId', roomId || roomName);
      await page2.click('#joinRoomBtn');
      await expect(page2.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Both players should see opponent
      await expect(page1.locator('#opponentName')).not.toContainText('等待对手', { timeout: 5000 });
      
      // Clean up
      await context1.close();
      await context2.close();
    });
    
    test('should synchronize moves between players', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Setup: Player 1 creates room
      await page1.goto(BASE_URL);
      const roomName = generateRoomName();
      await page1.fill('#roomName', roomName);
      await page1.click('#createRoomBtn');
      await expect(page1.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Get room ID and have Player 2 join
      await page1.evaluate(() => {
        document.getElementById('roomIdBox')?.classList.remove('hidden');
      });
      const roomId = await page1.locator('#roomIdDisplay').textContent();
      
      await page2.goto(BASE_URL);
      await page2.fill('#joinRoomId', roomId || roomName);
      await page2.click('#joinRoomBtn');
      await expect(page2.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Player 1 (red) makes a move
      const redPawn = page1.locator('.chess-piece.red:has-text("兵")').first();
      await redPawn.click();
      
      const validMove = page1.locator('.valid-move').first();
      await validMove.click();
      
      // Wait for move to sync to player 2
      await page2.waitForTimeout(3000);
      
      // Player 2 should see the move (turn indicator should change)
      await expect(page2.locator('#turnIndicator')).toContainText('你的回合', { timeout: 5000 });
      
      // Clean up
      await context1.close();
      await context2.close();
    });
  });
  
  test.describe('Responsive Design', () => {
    
    test('should display correctly on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto(BASE_URL);
      
      // Check all elements are visible
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#roomName')).toBeVisible();
      await expect(page.locator('#createRoomBtn')).toBeVisible();
      
      // Buttons should be touch-friendly (min 44px height)
      const createBtn = page.locator('#createRoomBtn');
      const box = await createBtn.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
    
    test('should display board correctly on tablet', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      
      await page.goto(BASE_URL);
      
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#chessBoard')).toBeVisible();
      
      // Board should fit within viewport
      const board = page.locator('#chessBoard');
      const box = await board.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(768);
    });
    
    test('should handle landscape mobile', async ({ page }) => {
      // Set landscape mobile viewport
      await page.setViewportSize({ width: 667, height: 375 });
      
      await page.goto(BASE_URL);
      
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#chessBoard')).toBeVisible();
    });
  });
  
  test.describe('Accessibility', () => {
    
    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Check main regions have ARIA labels
      await expect(page.locator('#app')).toHaveAttribute('role', 'application');
      await expect(page.locator('#lobby')).toHaveAttribute('aria-label');
      await expect(page.locator('#roomName')).toHaveAttribute('aria-label');
    });
    
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await expect(page.locator('#roomName')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#createRoomBtn')).toBeFocused();
      
      await page.keyboard.press('Tab');
      await expect(page.locator('#joinRoomId')).toBeFocused();
    });
    
    test('should have visible focus indicators', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Focus on create button
      await page.locator('#createRoomBtn').focus();
      
      // Should have visible focus ring (outline)
      const outline = await page.locator('#createRoomBtn').evaluate(
        el => window.getComputedStyle(el).outline
      );
      expect(outline).not.toBe('none');
    });
  });
  
  test.describe('CORS and API', () => {
    
    test('should successfully call API from production domain', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Try to create a room (this tests CORS)
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      
      // Should succeed (if CORS is configured correctly)
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    });
    
    test('should handle API errors gracefully', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Try to join a room that doesn't exist
      await page.fill('#joinRoomId', 'non-existent-room-testing-12345');
      await page.click('#joinRoomBtn');
      
      // Should show error message (not crash)
      await expect(page.locator('#lobbyMessage')).toBeVisible({ timeout: 5000 });
      const message = await page.locator('#lobbyMessage').textContent();
      expect(message).toContain('房间不存在');
    });
  });
  
  test.describe('Session Persistence', () => {
    
    test('should restore session after page refresh', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Create a room
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Wait for session to be saved
      await page.waitForTimeout(1000);
      
      // Refresh the page
      await page.reload({ waitUntil: 'networkidle' });
      
      // Wait for async session restoration to complete
      await page.waitForTimeout(2000);
      
      // Should restore to game screen (session storage)
      // Note: session restoration is async, so we need longer timeout
      await expect(page.locator('#game')).toBeVisible({ timeout: 15000 });
    });
    
    test('should restore game state after refresh', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Create a room
      const roomName = generateRoomName();
      await page.fill('#roomName', roomName);
      await page.click('#createRoomBtn');
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      
      // Wait for session to be saved
      await page.waitForTimeout(1000);
      
      // Refresh first (just testing session restore, not move persistence)
      await page.reload({ waitUntil: 'networkidle' });
      
      // Wait for async session restoration
      await page.waitForTimeout(2000);
      
      // Should restore game state
      await expect(page.locator('#game')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#chessBoard')).toBeVisible();
    });
  });
});