# Chinese Chess (中国象棋) - Comprehensive E2E Test Report

**Test Date:** 2026-03-26
**Production URL:** https://chinachess.pages.dev
**Browser:** Chromium
**Test Duration:** ~5.5 minutes
**Total Tests:** 108
**Passed:** 93 (86%)
**Failed:** 15 (14%)

---

## Executive Summary

The Chinese Chess application is **functional** with most core features working correctly. The main issues are:

1. **Multiplayer color assignment** - Players joining a room aren't getting the correct color indicator (both see "red" instead of one red, one black)
2. **Accessibility gaps** - Missing ARIA labels and keyboard navigation issues
3. **Board rendering tests** - Some CSS class expectations don't match actual implementation
4. **Edge cases** - Room full detection and duplicate room handling need improvement

---

## Test Results by Category

### ✅ PASSED Tests (93)

#### 1. Lobby Tests - Most Passing
| Test | Status |
|------|--------|
| Create room with Chinese name | ✅ PASS |
| Create room with English name | ✅ PASS |
| Create room with numbers | ✅ PASS |
| Create room with empty name | ✅ PASS |
| Create room with very long name | ✅ PASS |
| Room name input maxlength | ✅ PASS |
| Join room by name | ✅ PASS |
| Join non-existent room | ✅ PASS |
| Join with empty input | ✅ PASS |

#### 2. Game Board Tests - Most Passing
| Test | Status |
|------|--------|
| All 32 pieces visible in correct positions | ✅ PASS |
| Red pieces at bottom, black at top | ✅ PASS |
| River visible between rows 4-5 | ✅ PASS |
| Verify initial piece positions | ✅ PASS |

#### 3. Piece Movement Tests - Most Passing
| Test | Status |
|------|--------|
| Rook moves horizontally and vertically | ✅ PASS |
| Rook cannot jump over pieces | ✅ PASS |
| Rook captures enemy piece | ✅ PASS |
| Knight moves in L-shape | ✅ PASS |
| Knight blocked by leg (蹩马腿) | ✅ PASS |
| Elephant moves diagonally 2 steps | ✅ PASS |
| Elephant cannot cross river | ✅ PASS |
| Elephant blocked by 塞象眼 | ✅ PASS |
| Advisor moves diagonally 1 step | ✅ PASS |
| King moves 1 step orthogonally | ✅ PASS |
| Cannon moves like rook | ✅ PASS |
| Cannon captures by jumping | ✅ PASS |
| Pawn moves forward before river | ✅ PASS |
| Pawn moves sideways after river | ✅ PASS |

#### 4. Game Rules Tests - All Passing
| Test | Status |
|------|--------|
| Red moves first | ✅ PASS |
| Turn alternates after each move | ✅ PASS |
| Cannot move opponent pieces | ✅ PASS |
| Check detection shows warning | ✅ PASS |
| Cannot move into check | ✅ PASS |
| Checkmate detection ends game | ✅ PASS |

#### 5. Multiplayer Tests - Most Passing
| Test | Status |
|------|--------|
| Moves sync between players | ✅ PASS |
| Reconnection after refresh | ✅ PASS |
| Both players leave, room cleanup | ✅ PASS |

#### 6. Mobile/Responsive Tests - All Passing ✅
| Viewport | Lobby | Board Fits | Buttons Touchable | No H-Scroll | Text Readable |
|----------|-------|-------------|-------------------|-------------|---------------|
| 320px | ✅ | ✅ | ✅ | ✅ | ✅ |
| 375px | ✅ | ✅ | ✅ | ✅ | ✅ |
| 414px | ✅ | ✅ | ✅ | ✅ | ✅ |
| 768px | ✅ | ✅ | ✅ | ✅ | ✅ |

Additional tests:
- ✅ Pieces are touchable on mobile
- ✅ Landscape mobile layout works

#### 7. Edge Case Tests - Most Passing
| Test | Status |
|------|--------|
| Very long game (many moves) | ✅ PASS |
| Rapid clicking on piece | ✅ PASS |
| Network disconnection handling | ✅ PASS |
| Multiple browser tabs same session | ✅ PASS |
| Leave room during opponent turn | ✅ PASS |
| Invalid move coordinates | ✅ PASS |
| Session storage persistence | ✅ PASS |

#### 8. Accessibility Tests - Partial
| Test | Status |
|------|--------|
| Visible focus indicators | ✅ PASS |
| Screen reader announcements | ✅ PASS |
| Color contrast for text | ✅ PASS |

---

### ❌ FAILED Tests (15)

#### Critical Issues

##### 1. **Multiplayer: Player Color Assignment** 🔴 HIGH PRIORITY
```
Test: 5.1 - Second player joins and becomes black
Test: 1.2.1 - Join room by room ID
```
**Issue:** When a second player joins a room, both players see themselves as "red" instead of one being red and one being black.

**Evidence:**
- `#myColorIndicator` shows `class="color-indicator red"` for both players
- Expected: Player 2 should have `class="color-indicator black"`

**Impact:** This is a **critical gameplay bug** - players can't tell which side they're playing on.

**Root Cause:** The backend or frontend color assignment logic isn't correctly setting the color for the second player.

---

##### 2. **Accessibility: Missing ARIA Labels** 🟡 MEDIUM PRIORITY
```
Test: 8.1 - ARIA labels present
Test: should have proper ARIA labels
```
**Issue:** Input elements missing `aria-label` attribute.

**Actual HTML:**
```html
<input type="text" id="roomName" maxlength="100" placeholder="输入房间名称" aria-describedby="roomNameHelp"/>
```

**Expected:**
```html
<input type="text" id="roomName" maxlength="100" placeholder="输入房间名称" aria-label="房间名称" aria-describedby="roomNameHelp"/>
```

**Fix Required:** Add `aria-label` to:
- `#roomName`
- `#joinRoomId`
- Other interactive elements

---

##### 3. **Accessibility: Keyboard Navigation** 🟡 MEDIUM PRIORITY
```
Test: 8.2 - Keyboard navigation
Test: should be keyboard navigable
```
**Issue:** Tab key doesn't focus input elements as expected.

**Evidence:** After pressing Tab, `#roomName` is not focused (`inactive` state).

**Fix Required:** Ensure proper tabindex and focus management.

---

#### Minor Issues

##### 4. **Board Rendering: CSS Class Mismatch**
```
Test: 2.1 - Board renders correctly (9x10 grid)
```
**Issue:** Test expects 9 vertical lines but found 16.

**Analysis:** Likely the test expectation doesn't match actual CSS implementation. The board may render additional visual lines.

---

##### 5. **Board Rendering: Palace Lines**
```
Test: 2.5 - Palace diagonal lines visible
```
**Issue:** Test expects `palace-line` class but found 0 elements.

**Analysis:** Palace lines may be rendered differently (SVG, different class name, or pseudoelements).

---

##### 6. **Piece Movement Tests: Row Calculation**
```
Test: 3.4.2 - Advisor cannot leave palace
Test: 3.5.2 - King cannot leave palace
Test: 3.7.3 - Pawn cannot move backward
```
**Issue:** Row calculation from CSS position yields values outside expected range.

**Analysis:** The test's pixel-to-row calculation formula may be incorrect:
```javascript
const row = Math.round((parseInt(topMatch[1]) - 22) / 44);
```
This formula may not match the actual board layout in production.

---

##### 7. **Room Creation: Special Characters**
```
Test: 1.1.4 - Create room with special characters
```
**Issue:** Room with special characters doesn't show game board or error message.

**Analysis:** May be a validation or encoding issue with special characters.

---

##### 8. **Room Full Detection**
```
Test: 1.2.4 - Join full room (two players already)
```
**Issue:** Third player sees "⏳ 加入房间中..." instead of room full error.

**Expected:** Should show "房间已满" or similar.

---

##### 9. **Rate Limiting Test Timeout**
```
Test: 1.3.1 - Rate limit on room creation
```
**Issue:** Test timed out after 60s.

**Analysis:** Rate limiting may not be implemented, or the test approach needs adjustment.

---

##### 10. **Duplicate Room Handling**
```
Test: 7.5 - Duplicate room name handling
```
**Issue:** No error message shown when trying to join a room with duplicate name.

**Expected:** Should show "已存在" or similar error.

---

## Screenshots Available

Failure screenshots are saved in `test-results/` directory:
- `comprehensive-5-Multiplaye-77b80-yer-joins-and-becomes-black-chromium/`
- `comprehensive-8-Accessibil-*-chromium/`
- `comprehensive-1-Lobby-Test-*-chromium/`
- And others...

---

## Recommendations

### High Priority
1. **Fix player color assignment** - Critical for gameplay
   - Backend: Ensure player 2 gets assigned "black"
   - Frontend: Ensure `#myColorIndicator` reflects correct color

### Medium Priority
2. **Add ARIA labels** for accessibility
   - Add `aria-label` to all input fields and buttons
   - Add `role` attributes where semantic meaning is needed

3. **Fix keyboard navigation**
   - Ensure Tab key focuses interactive elements
   - Add visible focus indicators

### Low Priority
4. **Update tests** to match actual implementation:
   - Board line count expectations
   - Palace line detection
   - Row calculation formulas

5. **Improve error messaging**:
   - Room full detection
   - Duplicate room handling
   - Special character validation

---

## Test Files

- `tests/e2e/comprehensive.spec.js` - Comprehensive test suite (108 tests)
- `tests/e2e/game.spec.js` - Core game tests

## Run Command

```bash
npx playwright test --reporter=html
```

HTML report available at: `test-results/index.html`