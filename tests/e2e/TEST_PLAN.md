# Chinese Chess E2E Test Plan

## Overview
This document provides a comprehensive test plan for the Chinese Chess web application deployed at https://chinachess.pages.dev

## Test Environment
- Production URL: https://chinachess.pages.dev
- Test Framework: Playwright
- Browser Targets: Chromium, Firefox, WebKit (mobile)

## Test Categories

### 1. Lobby Screen Tests

#### 1.1 Room Creation
- [ ] **TC-LOBBY-001**: Create room with valid name
  - Enter a unique room name
  - Click "创建房间" button
  - Verify: Redirected to game screen
  - Verify: Room ID displayed
  - Verify: Turn indicator shows "等待对手加入"

- [ ] **TC-LOBBY-002**: Create room with empty name
  - Leave room name empty
  - Click "创建房间" button
  - Verify: Error message "请输入房间名称"

- [ ] **TC-LOBBY-003**: Create room with long name (100+ chars)
  - Enter room name with 100+ characters
  - Verify: Input is truncated or error shown

- [ ] **TC-LOBBY-004**: Create room with special characters
  - Enter room name with Chinese, emojis, special chars
  - Verify: Room created successfully or appropriate error

#### 1.2 Room Joining
- [ ] **TC-LOBBY-005**: Join existing room by ID
  - Enter valid room ID
  - Click "加入房间" button
  - Verify: Redirected to game screen as black player
  - Verify: Both players shown in header

- [ ] **TC-LOBBY-006**: Join existing room by name
  - Enter valid room name
  - Click "加入房间" button
  - Verify: Redirected to game screen as black player

- [ ] **TC-LOBBY-007**: Join non-existent room
  - Enter non-existent room ID/name
  - Verify: Error message "房间不存在"

- [ ] **TC-LOBBY-008**: Join full room
  - Try to join a room with two players
  - Verify: Error message "房间已满"

- [ ] **TC-LOBBY-009**: Join with empty input
  - Leave join input empty
  - Click "加入房间" button
  - Verify: Error message "请输入房间 ID 或名称"

### 2. Game Screen Tests

#### 2.1 Initial State
- [ ] **TC-GAME-001**: Verify initial board setup
  - Red pieces at bottom (rows 6-9)
  - Black pieces at top (rows 0-3)
  - Correct piece positions:
    - 車(ju) at corners
    - 馬(ma) next to 車
    - 象/相(xiang) next to 馬
    - 士/仕(shi) next to 象
    - 將/帥(jiang) at center
    - 炮(pao) at row 2/7
    - 兵/卒(zu) at row 3/6

- [ ] **TC-GAME-002**: Verify turn indicator for red player
  - Red player sees "你的回合"
  - Green text color

- [ ] **TC-GAME-003**: Verify turn indicator for black player
  - Black player sees "对手回合"
  - Gray text color

#### 2.2 Piece Selection
- [ ] **TC-GAME-004**: Select own piece
  - Click on a red piece during red's turn
  - Verify: Piece highlighted
  - Verify: Valid moves shown as dots

- [ ] **TC-GAME-005**: Select opponent's piece
  - Click on a black piece during red's turn
  - Verify: No selection

- [ ] **TC-GAME-006**: Select piece during opponent's turn
  - Click on red piece during black's turn
  - Verify: Message "等待对手走子..."

- [ ] **TC-GAME-007**: Deselect piece
  - Select a piece
  - Click elsewhere on board
  - Verify: Piece deselected, no valid moves shown

### 3. Chess Rules Tests

#### 3.1 将/帅 (King) Movement
- [ ] **TC-RULES-001**: King moves one step orthogonally
- [ ] **TC-RULES-002**: King cannot leave palace (3x3 area)
- [ ] **TC-RULES-003**: Kings cannot face each other (飞将 rule)

#### 3.2 士/仕 (Advisor) Movement
- [ ] **TC-RULES-004**: Advisor moves diagonally one step
- [ ] **TC-RULES-005**: Advisor cannot leave palace

#### 3.3 象/相 (Elephant) Movement
- [ ] **TC-RULES-006**: Elephant moves diagonally two steps
- [ ] **TC-RULES-007**: Elephant cannot cross river
- [ ] **TC-RULES-008**: Elephant blocked by piece at elephant eye

#### 3.4 馬 (Horse) Movement
- [ ] **TC-RULES-009**: Horse moves in L-shape
- [ ] **TC-RULES-010**: Horse blocked by piece at leg

#### 3.5 車 (Chariot) Movement
- [ ] **TC-RULES-011**: Chariot moves any distance orthogonally
- [ ] **TC-RULES-012**: Chariot stops when blocked

#### 3.6 炮 (Cannon) Movement
- [ ] **TC-RULES-013**: Cannon moves orthogonally without jumping
- [ ] **TC-RULES-014**: Cannon captures by jumping over exactly one piece

#### 3.7 兵/卒 (Pawn) Movement
- [ ] **TC-RULES-015**: Pawn moves forward one step before crossing river
- [ ] **TC-RULES-016**: Pawn can move sideways after crossing river
- [ ] **TC-RULES-017**: Pawn cannot move backward

### 4. Check and Checkmate Tests

#### 4.1 Check Detection
- [ ] **TC-CHECK-001**: King in check shows warning
  - Put king in check position
  - Verify: "将军！" message displayed
  - Verify: King highlighted with red border

- [ ] **TC-CHECK-002**: Must escape check
  - When in check, only moves that escape check are valid
  - Invalid moves are filtered out

#### 4.2 Checkmate Detection
- [ ] **TC-CHECKMATE-001**: Checkmate ends game
  - Create checkmate position
  - Verify: Game over message
  - Verify: Winner announced

#### 4.3 Stalemate Detection
- [ ] **TC-STALEMATE-001**: Stalemate results in draw
  - Create stalemate position (no legal moves, not in check)
  - Verify: "逼和！双方平局" message

### 5. Multiplayer Tests

#### 5.1 Two-Player Game Flow
- [ ] **TC-MULTI-001**: Full game flow
  1. Player A creates room
  2. Player B joins room
  3. Verify: Both players see correct colors
  4. Players alternate moves
  5. Verify: Turn indicator updates correctly

- [ ] **TC-MULTI-002**: Move synchronization
  1. Player A makes move
  2. Verify: Player B sees the move within 2 seconds
  3. Verify: Turn switches to Player B

- [ ] **TC-MULTI-003**: Opponent online status
  - Verify: Online indicator shows when both players connected

#### 5.2 Reconnection Tests
- [ ] **TC-RECONNECT-001**: Player refreshes page
  - Player A refreshes browser
  - Verify: Player A rejoins automatically
  - Verify: Game state preserved

- [ ] **TC-RECONNECT-002**: Player leaves and returns
  - Player A clicks "离开" button
  - Player A re-enters room ID
  - Verify: Player can rejoin
  - Verify: Game state preserved

- [ ] **TC-RECONNECT-003**: Both players disconnect
  - Both players close browser
  - After timeout (5 minutes), room should be cleaned up
  - Verify: Room no longer exists

### 6. Edge Case Tests

#### 6.1 Room Management
- [ ] **TC-EDGE-001**: Duplicate room name
  - Create room with name that already exists
  - Verify: Error message "房间名称已存在"

- [ ] **TC-EDGE-002**: Room cleanup after all leave
  - Both players leave room
  - Wait 5 minutes
  - Verify: Room cleaned up

#### 6.2 Concurrent Operations
- [ ] **TC-EDGE-003**: Simultaneous moves
  - Both players try to move at same time
  - Verify: Only one move succeeds
  - Verify: Other player sees conflict resolved

#### 6.3 Invalid Inputs
- [ ] **TC-EDGE-004**: Invalid room ID format
  - Enter room ID with invalid characters
  - Verify: Appropriate error message

### 7. UI/UX Tests

#### 7.1 Responsive Design
- [ ] **TC-UI-001**: Desktop layout (1920x1080)
  - Verify: All elements visible and properly sized
  - Verify: Board centered

- [ ] **TC-UI-002**: Tablet layout (768x1024)
  - Verify: Responsive scaling
  - Verify: Touch-friendly buttons

- [ ] **TC-UI-003**: Mobile layout (375x667)
  - Verify: Board fits screen
  - Verify: Text readable
  - Verify: Buttons touch-friendly (min 44px)

- [ ] **TC-UI-004**: Landscape mobile
  - Verify: Layout adapts to landscape
  - Verify: Board still visible

#### 7.2 Visual Feedback
- [ ] **TC-UI-005**: Selected piece highlight
  - Select a piece
  - Verify: Piece has blue border and shadow

- [ ] **TC-UI-006**: Valid moves indicator
  - Select a piece
  - Verify: Valid moves shown as dots

- [ ] **TC-UI-007**: Check warning
  - King in check
  - Verify: Red pulsing indicator

- [ ] **TC-UI-008**: Turn indicator colors
  - Your turn: Green
  - Opponent turn: Gray
  - Check: Red

#### 7.3 Accessibility
- [ ] **TC-A11Y-001**: Keyboard navigation
  - Tab through elements
  - Verify: All interactive elements focusable

- [ ] **TC-A11Y-002**: Screen reader support
  - Use screen reader
  - Verify: ARIA labels present
  - Verify: Turn changes announced

- [ ] **TC-A11Y-003**: Color contrast
  - Verify: Text meets WCAG AA contrast requirements

### 8. Performance Tests

#### 8.1 Load Time
- [ ] **TC-PERF-001**: Initial page load
  - Measure time to interactive
  - Target: < 3 seconds

- [ ] **TC-PERF-002**: Board render time
  - Measure time to render board
  - Target: < 500ms

#### 8.2 Network
- [ ] **TC-PERF-003**: Move submission
  - Measure API response time
  - Target: < 500ms

- [ ] **TC-PERF-004**: State polling
  - Verify: Polling interval ~1.5 seconds
  - Verify: Updates received promptly

### 9. Error Handling Tests

- [ ] **TC-ERROR-001**: Network disconnection
  - Disconnect network
  - Verify: Error message shown
  - Reconnect
  - Verify: Game recovers

- [ ] **TC-ERROR-002**: API error
  - Simulate 500 error
  - Verify: User-friendly error message

- [ ] **TC-ERROR-003**: Invalid server response
  - Verify: App doesn't crash on malformed JSON
  - Verify: Error message shown

## Test Execution Instructions

### Prerequisites
1. Install Playwright: `npm install -D @playwright/test`
2. Install browsers: `npx playwright install`
3. Ensure production site is deployed

### Running Tests
```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/game.spec.js

# Run in UI mode for debugging
npx playwright test --ui

# Run on specific browser
npx playwright test --project=chromium
```

### Test Data
- Use unique room names with timestamp for isolation
- Clean up test rooms after tests complete

### Reporting
- Playwright HTML report: `playwright-report/index.html`
- Screenshots on failure: `test-results/`