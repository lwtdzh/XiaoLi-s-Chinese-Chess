// Chinese Chess Frontend — REST API + Polling Architecture

class ChineseChess {
    constructor() {
        // Game state
        this.board = this.initializeBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        this.gameOver = false;
        this.color = null;
        this.roomId = null;
        this.roomName = null;
        this.playerId = null;
        this.moveCount = 0;

        // Polling
        this.pollTimer = null;
        this.pollInterval = 1500; // 1.5秒轮询间隔
        this.lastUpdatedAt = 0;

        // Check state
        this.isInCheck = false;

        // Event listener tracking for cleanup
        this.eventListeners = [];

        // Board state tracking for getRawMoves and isCheckmate
        this._rawMovesBoardStack = [];
        this._checkmateBoardStack = [];

        // Initialize
        this.initUI();
        this.restoreSession();
    }

    // ========================================
    // Helper Functions
    // ========================================

    /**
     * Efficient deep copy of the board (10x9 array)
     * Faster than JSON.parse(JSON.stringify()) for this specific structure
     */
    deepCopyBoard(board) {
        const newBoard = Array(10).fill(null).map(() => Array(9).fill(null));
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece) {
                    newBoard[row][col] = { ...piece };
                }
            }
        }
        return newBoard;
    }

    // ========================================
    // Session Persistence
    // ========================================

    saveSession() {
        if (this.roomId && this.playerId) {
            try {
                sessionStorage.setItem('chess_session', JSON.stringify({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    color: this.color,
                    roomName: this.roomName
                }));
            } catch (e) {
                console.error('[Session Save] Error:', e);
                // Ignore sessionStorage errors (e.g., quota exceeded, private browsing mode)
            }
        }
    }

    restoreSession() {
        try {
            const saved = sessionStorage.getItem('chess_session');
            if (!saved) return;
            const session = JSON.parse(saved);
            
            // Validate session fields before use
            if (!session || 
                typeof session.roomId !== 'string' || !session.roomId ||
                typeof session.playerId !== 'string' || !session.playerId ||
                (session.color !== 'red' && session.color !== 'black')) {
                console.error('[Session Restore] Invalid session data:', session);
                sessionStorage.removeItem('chess_session');
                return;
            }
            
            if (session.roomId && session.playerId) {
                // 检查是否已经在房间中，避免重复恢复导致的竞态条件
                if (this.roomId) {
                    console.log('[Session Restore] Already in room, skipping restore:', this.roomId);
                    return;
                }
                this.showMessage('⏳ 正在恢复上次游戏...');
                // 避免在初始化阶段重复触发 join/poll，确保只恢复一次
                if (this._restoringSession) return;
                this._restoringSession = true;
                this.rejoinRoom(session)
                    .catch((e) => {
                        console.error('[Session Restore] Error:', e);
                        try {
                            sessionStorage.removeItem('chess_session');
                        } catch (removeError) {
                            console.error('[Session Remove] Error:', removeError);
                        }
                    })
                    .finally(() => {
                        this._restoringSession = false;
                    });
            }
        } catch (e) {
            console.error('[Session Restore] Parse error:', e);
            sessionStorage.removeItem('chess_session');
        }
    }

    async rejoinRoom(session) {
        try {
            const res = await fetch(`/api/rooms/${session.roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: session.playerId })
            });

            if (!res.ok) {
                sessionStorage.removeItem('chess_session');
                this.showMessage('⚠️ 无法恢复游戏，请重新开始');
                return;
            }

            const data = await res.json();
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.color = data.color;
            this.roomName = data.roomName;

            if (data.gameState) {
                this.loadGameState(data.gameState);
            }

            this.switchToGameScreen();
            // 先停止可能存在的轮询，再启动新的轮询，避免重复
            this.stopPolling();
            this.startPolling();
            this.showMessage('✅ 已恢复游戏');
        } catch (e) {
            sessionStorage.removeItem('chess_session');
            this.showMessage('⚠️ 网络错误，请重新开始');
        }
    }

    // ========================================
    // Board Initialization
    // ========================================

    initializeBoard() {
        const board = Array(10).fill(null).map(() => Array(9).fill(null));

        board[0][0] = { type: 'ju', color: 'black', name: '車' };
        board[0][1] = { type: 'ma', color: 'black', name: '馬' };
        board[0][2] = { type: 'xiang', color: 'black', name: '象' };
        board[0][3] = { type: 'shi', color: 'black', name: '士' };
        board[0][4] = { type: 'jiang', color: 'black', name: '將' };
        board[0][5] = { type: 'shi', color: 'black', name: '士' };
        board[0][6] = { type: 'xiang', color: 'black', name: '象' };
        board[0][7] = { type: 'ma', color: 'black', name: '馬' };
        board[0][8] = { type: 'ju', color: 'black', name: '車' };
        board[2][1] = { type: 'pao', color: 'black', name: '砲' };
        board[2][7] = { type: 'pao', color: 'black', name: '砲' };
        board[3][0] = { type: 'zu', color: 'black', name: '卒' };
        board[3][2] = { type: 'zu', color: 'black', name: '卒' };
        board[3][4] = { type: 'zu', color: 'black', name: '卒' };
        board[3][6] = { type: 'zu', color: 'black', name: '卒' };
        board[3][8] = { type: 'zu', color: 'black', name: '卒' };

        board[9][0] = { type: 'ju', color: 'red', name: '車' };
        board[9][1] = { type: 'ma', color: 'red', name: '馬' };
        board[9][2] = { type: 'xiang', color: 'red', name: '相' };
        board[9][3] = { type: 'shi', color: 'red', name: '仕' };
        board[9][4] = { type: 'jiang', color: 'red', name: '帥' };
        board[9][5] = { type: 'shi', color: 'red', name: '仕' };
        board[9][6] = { type: 'xiang', color: 'red', name: '相' };
        board[9][7] = { type: 'ma', color: 'red', name: '馬' };
        board[9][8] = { type: 'ju', color: 'red', name: '車' };
        board[7][1] = { type: 'pao', color: 'red', name: '炮' };
        board[7][7] = { type: 'pao', color: 'red', name: '炮' };
        board[6][0] = { type: 'zu', color: 'red', name: '兵' };
        board[6][2] = { type: 'zu', color: 'red', name: '兵' };
        board[6][4] = { type: 'zu', color: 'red', name: '兵' };
        board[6][6] = { type: 'zu', color: 'red', name: '兵' };
        board[6][8] = { type: 'zu', color: 'red', name: '兵' };

        return board;
    }

    // ========================================
    // Cleanup
    // ========================================

    cleanup() {
        // Stop polling
        this.stopPolling();
        
        // Remove all tracked event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        
        // NOTE: Do NOT clear session here!
        // Session should persist across page refreshes for reconnection.
        // Session is only cleared when user explicitly leaves via leaveRoom().
    }

    addTrackedEventListener(element, event, handler) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    // ========================================
    // UI Initialization
    // ========================================

    initUI() {
        this.renderBoard();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const createBtn = document.getElementById('createRoomBtn');
        const joinBtn = document.getElementById('joinRoomBtn');
        const leaveBtn = document.getElementById('leaveRoomBtn');
        const roomIdDisplay = document.getElementById('roomIdDisplay');
        const chessBoard = document.getElementById('chessBoard');

        if (createBtn) this.addTrackedEventListener(createBtn, 'click', () => this.createRoom());
        if (joinBtn) this.addTrackedEventListener(joinBtn, 'click', () => this.joinRoom());
        if (leaveBtn) this.addTrackedEventListener(leaveBtn, 'click', () => this.leaveRoom());
        
        // Add room ID copy functionality
        if (roomIdDisplay) {
            this.addTrackedEventListener(roomIdDisplay, 'click', () => this.copyRoomId());
            this.addTrackedEventListener(roomIdDisplay, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.copyRoomId();
                }
            });
        }
        
        // Add keyboard navigation support for chess board
        if (chessBoard) {
            this.addTrackedEventListener(chessBoard, 'keydown', (e) => this.handleKeyboardNavigation(e));
            // Click on empty board area deselects piece
            this.addTrackedEventListener(chessBoard, 'click', (e) => {
                // Only deselect if clicking directly on the board, not on a piece or valid move
                if (e.target === chessBoard || e.target.classList.contains('river')) {
                    if (this.selectedPiece) {
                        this.selectedPiece = null;
                        this.selectedPosition = null;
                        this.validMoves = [];
                        this.renderBoard();
                    }
                }
            });
        }
        
        // Add resize handler to redraw board when viewport changes
        // Use debounced resize to avoid excessive redraws
        let resizeTimeout = null;
        this.addTrackedEventListener(window, 'resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Only redraw if we're in a game
                if (this.roomId) {
                    this.renderBoard();
                }
            }, 150);
        });
        
        // Also handle orientation change on mobile
        this.addTrackedEventListener(window, 'orientationchange', () => {
            setTimeout(() => {
                if (this.roomId) {
                    this.renderBoard();
                }
            }, 100);
        });
    }

    // ========================================
    // Board Rendering
    // ========================================

    /**
     * Get CSS custom property values for responsive board sizing
     * @returns {Object} Board dimension values
     */
    getBoardDimensions() {
        const boardElement = document.getElementById('chessBoard');
        if (!boardElement) {
            // Fallback defaults
            return {
                cellSize: 44,
                padding: 22,
                pieceSize: 40,
                lineWidth: 2
            };
        }
        
        const computedStyle = getComputedStyle(boardElement);
        
        // Parse CSS custom properties
        const cellSize = parseFloat(computedStyle.getPropertyValue('--board-cell-size')) || 44;
        const padding = parseFloat(computedStyle.getPropertyValue('--board-padding')) || 22;
        const pieceSize = parseFloat(computedStyle.getPropertyValue('--piece-size')) || 40;
        const lineWidth = parseFloat(computedStyle.getPropertyValue('--board-line-width')) || 2;
        
        return { cellSize, padding, pieceSize, lineWidth };
    }

    renderBoard() {
        const boardElement = document.getElementById('chessBoard');
        if (!boardElement) return;

        boardElement.innerHTML = '';
        
        // Get responsive dimensions from CSS custom properties
        const dims = this.getBoardDimensions();
        const { cellSize, padding, pieceSize, lineWidth } = dims;
        
        // Calculate offsets (center of intersection points)
        const offsetX = padding; // 棋子中心 X 偏移
        const offsetY = padding; // 棋子中心 Y 偏移
        const pieceRadius = pieceSize / 2; // 棋子半径
        
        this.drawBoardLines(boardElement, dims);

        // 移除之前棋盘上所有棋子和合法走法标记的事件监听器
        // 避免在频繁渲染时累积监听器导致内存泄漏
        this.eventListeners = this.eventListeners.filter(({ element }) => {
            if (boardElement.contains(element)) {
                element.removeEventListener('click', element._clickHandler);
                element.removeEventListener('keydown', element._keydownHandler);
                return false;
            }
            return true;
        });

        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    const el = document.createElement('div');
                    el.className = `chess-piece ${piece.color}`;
                    el.textContent = piece.name;
                    // 棋子中心对准交叉点
                    el.style.left = `${col * cellSize + offsetX - pieceRadius}px`;
                    el.style.top = `${row * cellSize + offsetY - pieceRadius}px`;
                    el.dataset.row = row;
                    el.dataset.col = col;
                    el.setAttribute('role', 'gridcell');
                    el.setAttribute('aria-label', `${piece.color === 'red' ? '红' : '黑'}方${piece.name}`);

                    if (this.selectedPosition &&
                        this.selectedPosition.row === row &&
                        this.selectedPosition.col === col) {
                        el.classList.add('selected');
                    }

                    const clickHandler = () => this.handlePieceClick(row, col);
                    el._clickHandler = clickHandler;
                    this.addTrackedEventListener(el, 'click', clickHandler);
                    boardElement.appendChild(el);
                }
            }
        }

        // 合法走法标记
        this.validMoves.forEach(move => {
            const dot = document.createElement('div');
            dot.className = 'valid-move';
            dot.style.left = `${move.col * cellSize + offsetX}px`;
            dot.style.top = `${move.row * cellSize + offsetY}px`;
            dot.setAttribute('role', 'button');
            dot.setAttribute('aria-label', `移动到第${move.row + 1}行第${move.col + 1}列`);
            const clickHandler = () => this.handleMoveClick(move.row, move.col);
            dot._clickHandler = clickHandler;
            this.addTrackedEventListener(dot, 'click', clickHandler);
            boardElement.appendChild(dot);
        });

        // 将军高亮
        if (this.isInCheck) {
            this.highlightKingInCheck(boardElement, cellSize, offsetX, offsetY, pieceRadius);
        }
    }

    highlightKingInCheck(boardElement, cellSize, offsetX, offsetY, pieceRadius) {
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === 'jiang' && piece.color === this.currentPlayer) {
                    const indicator = document.createElement('div');
                    indicator.className = 'check-indicator';
                    indicator.style.left = `${col * cellSize + offsetX - pieceRadius}px`;
                    indicator.style.top = `${row * cellSize + offsetY - pieceRadius}px`;
                    indicator.style.width = `${pieceRadius * 2}px`;
                    indicator.style.height = `${pieceRadius * 2}px`;
                    indicator.style.borderRadius = '50%';
                    indicator.style.border = '3px solid #ff0000';
                    indicator.style.position = 'absolute';
                    indicator.style.animation = 'pulse 1s infinite';
                    indicator.style.pointerEvents = 'none';
                    boardElement.appendChild(indicator);
                }
            }
        }
    }

    drawBoardLines(boardElement, dims) {
        const { cellSize, padding } = dims;
        const lineWidth = dims.lineWidth || 1.5;
        
        // Calculate board dimensions
        const boardWidth = 8 * cellSize; // 9 columns = 8 cells width
        const topHalfHeight = 4 * cellSize; // Top half: 5 rows = 4 cells
        const bottomHalfHeight = 4 * cellSize; // Bottom half: 5 rows = 4 cells
        const fullBoardHeight = 9 * cellSize; // 10 rows = 9 cells

        // Draw horizontal lines (10 lines for 10 rows)
        for (let i = 0; i < 10; i++) {
            const line = document.createElement('div');
            line.className = 'board-line horizontal';
            line.style.top = `${i * cellSize + padding}px`;
            line.style.width = `${boardWidth}px`;
            line.style.left = `${padding}px`;
            boardElement.appendChild(line);
        }

        // Draw vertical lines (9 lines for 9 columns)
        // Edge columns (0 and 8): continuous through the river
        // Interior columns (1-7): broken at the river
        
        for (let i = 0; i < 9; i++) {
            if (i === 0 || i === 8) {
                // Edge columns: continuous vertical line
                const line = document.createElement('div');
                line.className = 'board-line vertical';
                line.style.left = `${i * cellSize + padding}px`;
                line.style.height = `${fullBoardHeight}px`;
                line.style.top = `${padding}px`;
                boardElement.appendChild(line);
            } else {
                // Interior columns: broken at river
                // Top half (rows 0-4)
                const topLine = document.createElement('div');
                topLine.className = 'board-line vertical';
                topLine.style.left = `${i * cellSize + padding}px`;
                topLine.style.height = `${topHalfHeight}px`;
                topLine.style.top = `${padding}px`;
                boardElement.appendChild(topLine);
                
                // Bottom half (rows 5-9)
                const bottomLine = document.createElement('div');
                bottomLine.className = 'board-line vertical';
                bottomLine.style.left = `${i * cellSize + padding}px`;
                bottomLine.style.height = `${bottomHalfHeight}px`;
                bottomLine.style.top = `${5 * cellSize + padding}px`;
                boardElement.appendChild(bottomLine);
            }
        }

        // Draw river between rows 4 and 5
        // River height equals one cell height
        const river = document.createElement('div');
        river.className = 'river';
        river.textContent = '楚河        漢界';
        river.style.top = `${4 * cellSize + padding}px`;
        river.style.left = `${padding}px`;
        river.style.width = `${boardWidth}px`;
        river.style.height = `${cellSize}px`;
        boardElement.appendChild(river);

        this.drawPalaceLines(boardElement, dims);
    }

    drawPalaceLines(boardElement, dims) {
        const { cellSize, padding } = dims;
        
        // Palace positions: columns 3-5 (center 3 columns)
        // Top palace: rows 0-2 (black side)
        // Bottom palace: rows 7-9 (red side)
        
        // Calculate diagonal length using Pythagorean theorem
        // Diagonal spans 2 cells horizontally and 2 cells vertically
        const diagonalLength = Math.sqrt(8) * cellSize; // sqrt(2^2 + 2^2) * cellSize = sqrt(8) * cellSize
        
        // Calculate angles for diagonal lines
        // For a square, the diagonal angle is 45 degrees
        // tan(45°) = 1, so the angle for the diagonals
        const angle = Math.atan2(2 * cellSize, 2 * cellSize) * (180 / Math.PI); // ~45 degrees

        // Top palace diagonals (rows 0-2, cols 3-5)
        // Top-left to bottom-right diagonal
        const topLeftX = 3 * cellSize + padding;
        const topLeftY = 0 * cellSize + padding;
        
        // Top-right to bottom-left diagonal
        const topRightX = 5 * cellSize + padding;
        const topRightY = 0 * cellSize + padding;
        
        // Create top palace diagonals
        const topPalaceLine1 = document.createElement('div');
        topPalaceLine1.className = 'board-line palace-line';
        topPalaceLine1.style.position = 'absolute';
        topPalaceLine1.style.left = `${topLeftX}px`;
        topPalaceLine1.style.top = `${topLeftY}px`;
        topPalaceLine1.style.width = '2px';
        topPalaceLine1.style.height = `${diagonalLength}px`;
        topPalaceLine1.style.transform = `rotate(${angle}deg)`;
        topPalaceLine1.style.transformOrigin = 'top left';
        boardElement.appendChild(topPalaceLine1);
        
        const topPalaceLine2 = document.createElement('div');
        topPalaceLine2.className = 'board-line palace-line';
        topPalaceLine2.style.position = 'absolute';
        topPalaceLine2.style.left = `${topRightX}px`;
        topPalaceLine2.style.top = `${topRightY}px`;
        topPalaceLine2.style.width = '2px';
        topPalaceLine2.style.height = `${diagonalLength}px`;
        topPalaceLine2.style.transform = `rotate(-${angle}deg)`;
        topPalaceLine2.style.transformOrigin = 'top right';
        boardElement.appendChild(topPalaceLine2);

        // Bottom palace diagonals (rows 7-9, cols 3-5)
        const bottomLeftX = 3 * cellSize + padding;
        const bottomLeftY = 7 * cellSize + padding;
        
        const bottomRightX = 5 * cellSize + padding;
        const bottomRightY = 7 * cellSize + padding;
        
        // Create bottom palace diagonals
        const bottomPalaceLine1 = document.createElement('div');
        bottomPalaceLine1.className = 'board-line palace-line';
        bottomPalaceLine1.style.position = 'absolute';
        bottomPalaceLine1.style.left = `${bottomLeftX}px`;
        bottomPalaceLine1.style.top = `${bottomLeftY}px`;
        bottomPalaceLine1.style.width = '2px';
        bottomPalaceLine1.style.height = `${diagonalLength}px`;
        bottomPalaceLine1.style.transform = `rotate(-${angle}deg)`;
        bottomPalaceLine1.style.transformOrigin = 'top left';
        boardElement.appendChild(bottomPalaceLine1);
        
        const bottomPalaceLine2 = document.createElement('div');
        bottomPalaceLine2.className = 'board-line palace-line';
        bottomPalaceLine2.style.position = 'absolute';
        bottomPalaceLine2.style.left = `${bottomRightX}px`;
        bottomPalaceLine2.style.top = `${bottomRightY}px`;
        bottomPalaceLine2.style.width = '2px';
        bottomPalaceLine2.style.height = `${diagonalLength}px`;
        bottomPalaceLine2.style.transform = `rotate(${angle}deg)`;
        bottomPalaceLine2.style.transformOrigin = 'top right';
        boardElement.appendChild(bottomPalaceLine2);
    }

    // ========================================
    // Game Logic
    // ========================================

    handlePieceClick(row, col) {
        if (this.gameOver) return;
        if (this.currentPlayer !== this.color) {
            this.showMessage('等待对手走子...');
            return;
        }

        const piece = this.board[row][col];

        if (piece && piece.color === this.color) {
            this.selectedPiece = piece;
            this.selectedPosition = { row, col };
            this.validMoves = this.getValidMoves(row, col, piece);
            this.renderBoard();
        } else if (this.selectedPiece && this.isValidMove(row, col)) {
            this.handleMoveClick(row, col);
        }
    }

    handleMoveClick(row, col) {
        if (!this.selectedPiece || this.gameOver) return;
        if (this.currentPlayer !== this.color) return;
        if (this.isValidMove(row, col)) {
            this.makeMove(this.selectedPosition.row, this.selectedPosition.col, row, col);
        }
    }

    isValidMove(row, col) {
        return this.validMoves.some(m => m.row === row && m.col === col);
    }

    async makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];

        // Validation: Check if attempting to capture king (illegal move in Chinese Chess)
        if (capturedPiece && capturedPiece.type === 'jiang' && !this.gameOver) {
            console.warn('[makeMove] Attempting to capture king directly is illegal');
            this.showMessage('⚠️ 不能直接吃掉将/帅');
            return;
        }

        // 保存状态用于回滚
        const previousBoard = this.deepCopyBoard(this.board);
        const previousTurn = this.currentPlayer;
        const previousCheck = this.isInCheck;

        // 乐观更新
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';

        if (capturedPiece && capturedPiece.type === 'jiang') {
            this.gameOver = true;
            this.showMessage(`🏆 ${piece.color === 'red' ? '红方' : '黑方'}获胜！`);
        } else {
            // Check if the new current player has any legal moves
            this.isInCheck = this.isKingInCheck(this.board, this.currentPlayer);
            
            if (!this.hasLegalMoves(this.board, this.currentPlayer)) {
                // No legal moves - either checkmate or stalemate
                this.gameOver = true;
                if (this.isInCheck) {
                    // Checkmate - current player is in check and has no legal moves
                    this.showMessage(`🏆 将杀！${piece.color === 'red' ? '红方' : '黑方'}获胜！`);
                } else {
                    // Stalemate - current player is not in check but has no legal moves
                    this.showMessage('🤝 逼和！双方平局');
                }
            } else if (this.isInCheck) {
                // Current player is in check but has legal moves to escape
                this.showMessage('⚠️ 将军！');
            }
        }

        this.moveCount++;
        this.renderBoard();
        this.updateTurnIndicator();

        // 发送到服务器
        try {
            const res = await fetch(`/api/rooms/${this.roomId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: this.playerId,
                    from: { row: fromRow, col: fromCol },
                    to: { row: toRow, col: toCol },
                    expectedMoveCount: this.moveCount - 1
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 409 && err && err.code === 'MOVE_CONFLICT') {
                    // 并发冲突：不把它当作"走子失败"，而是提示并尽快通过轮询拉取最新状态
                    this.showMessage('⚠️ 对局已更新，请稍候同步...');
                    // 回滚本地状态，使用之前保存的旧状态而不是乐观更新后的状态
                    this.rollbackMove(previousBoard, previousTurn, previousCheck);
                    // 立即触发一次轮询以获取最新状态，添加错误处理
                    try {
                        await this.pollState();
                    } catch (pollError) {
                        console.error('[Move Conflict] Poll error:', pollError);
                    }
                    throw new Error('MOVE_CONFLICT');
                }
                throw new Error(err.error || '走子失败');
            }

            const data = await res.json();

            // 成功后以服务端返回为准，避免与权威后端状态不一致
            if (data.gameState) {
                this.lastUpdatedAt = data.gameState.updatedAt;
                this.loadGameState(data.gameState);

                if (data.gameState.status === 'ended') {
                    this.gameOver = true;
                }
            }
        } catch (error) {
            // 并发冲突：不回滚到旧盘面，等待轮询把权威状态同步回来
            if (error && error.message === 'MOVE_CONFLICT') {
                return;
            }

            // 回滚
            this.rollbackMove(previousBoard, previousTurn, previousCheck);
            this.showMessage(`❌ ${error.message}`);
        }
    }

    rollbackMove(previousBoard, previousTurn, previousCheck) {
        this.board = previousBoard;
        this.currentPlayer = previousTurn;
        this.isInCheck = previousCheck;
        this.gameOver = false;
        this.moveCount--;
        // 清除选中状态，避免状态不一致
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        this.renderBoard();
        this.updateTurnIndicator();
    }

    // ========================================
    // Chess Rules
    // ========================================

    getValidMoves(row, col, piece) {
        let moves = [];

        switch (piece.type) {
            case 'jiang': moves = this.getJiangBasicMoves(row, col, piece.color); break;
            case 'shi': moves = this.getShiMoves(row, col, piece.color); break;
            case 'xiang': moves = this.getXiangMoves(row, col, piece.color); break;
            case 'ma': moves = this.getMaMoves(row, col, piece.color); break;
            case 'ju': moves = this.getJuMoves(row, col, piece.color); break;
            case 'pao': moves = this.getPaoMoves(row, col, piece.color); break;
            case 'zu': moves = this.getZuMoves(row, col, piece.color); break;
        }

        // 排除会导致自己被将军的走法
        return moves.filter(move => {
            const testBoard = this.deepCopyBoard(this.board);
            testBoard[move.row][move.col] = testBoard[row][col];
            testBoard[row][col] = null;
            return !this.isKingInCheck(testBoard, piece.color);
        });
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }

    // Note: getJiangMoves() was removed - it was dead code (never called)
    // All king movement uses getJiangBasicMoves() which correctly handles
    // palace bounds. Flying general (飞将) is handled in isKingInCheck() and getRawMoves()

    getJiangBasicMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const minRow = color === 'red' ? 7 : 0;
        const maxRow = color === 'red' ? 9 : 2;

        for (const [dr, dc] of directions) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= minRow && nr <= maxRow && nc >= 3 && nc <= 5) {
                const target = this.board[nr][nc];
                if (!target || target.color !== color) {
                    moves.push({ row: nr, col: nc });
                }
            }
        }
        return moves;
    }

    getShiMoves(row, col, color) {
        const moves = [];
        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        const minRow = color === 'red' ? 7 : 0;
        const maxRow = color === 'red' ? 9 : 2;

        for (const [dr, dc] of directions) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= minRow && nr <= maxRow && nc >= 3 && nc <= 5) {
                const target = this.board[nr][nc];
                if (!target || target.color !== color) {
                    moves.push({ row: nr, col: nc });
                }
            }
        }
        return moves;
    }

    getXiangMoves(row, col, color) {
        const moves = [];
        const directions = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
        const blocks = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

        for (let i = 0; i < directions.length; i++) {
            const [dr, dc] = directions[i];
            const [br, bc] = blocks[i];
            const nr = row + dr;
            const nc = col + dc;
            const blockRow = row + br;
            const blockCol = col + bc;

            if (!this.isValidPosition(nr, nc)) continue;
            if (color === 'red' && nr < 5) continue;
            if (color === 'black' && nr > 4) continue;

            // 检查塞象眼位置是否有效
            if (this.isValidPosition(blockRow, blockCol) && !this.board[blockRow][blockCol]) {
                const target = this.board[nr][nc];
                if (!target || target.color !== color) {
                    moves.push({ row: nr, col: nc });
                }
            }
        }
        return moves;
    }

    getMaMoves(row, col, color) {
        const moves = [];
        const jumps = [
            { move: [-2, -1], block: [-1, 0] },
            { move: [-2, 1], block: [-1, 0] },
            { move: [2, -1], block: [1, 0] },
            { move: [2, 1], block: [1, 0] },
            { move: [-1, -2], block: [0, -1] },
            { move: [1, -2], block: [0, -1] },
            { move: [-1, 2], block: [0, 1] },
            { move: [1, 2], block: [0, 1] }
        ];

        for (const jump of jumps) {
            const nr = row + jump.move[0];
            const nc = col + jump.move[1];
            const br = row + jump.block[0];
            const bc = col + jump.block[1];

            if (!this.isValidPosition(nr, nc)) continue;
            // 检查蹩马腿位置是否有效
            if (!this.isValidPosition(br, bc)) continue;
            if (this.board[br][bc]) continue;

            const target = this.board[nr][nc];
            if (!target || target.color !== color) {
                moves.push({ row: nr, col: nc });
            }
        }
        return moves;
    }

    getJuMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dr, dc] of directions) {
            let nr = row + dr;
            let nc = col + dc;
            while (this.isValidPosition(nr, nc)) {
                const target = this.board[nr][nc];
                if (!target) {
                    moves.push({ row: nr, col: nc });
                } else {
                    if (target.color !== color) moves.push({ row: nr, col: nc });
                    break;
                }
                nr += dr;
                nc += dc;
            }
        }
        return moves;
    }

    getPaoMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dr, dc] of directions) {
            let nr = row + dr;
            let nc = col + dc;
            let jumped = false;

            while (this.isValidPosition(nr, nc)) {
                const target = this.board[nr][nc];
                if (!jumped) {
                    if (!target) {
                        moves.push({ row: nr, col: nc });
                    } else {
                        jumped = true;
                    }
                } else {
                    if (target) {
                        if (target.color !== color) moves.push({ row: nr, col: nc });
                        break;
                    }
                }
                nr += dr;
                nc += dc;
            }
        }
        return moves;
    }

    getZuMoves(row, col, color) {
        const moves = [];
        const forward = color === 'red' ? -1 : 1;
        const crossedRiver = color === 'red' ? row <= 4 : row >= 5;

        const nr = row + forward;
        if (this.isValidPosition(nr, col)) {
            const target = this.board[nr][col];
            if (!target || target.color !== color) moves.push({ row: nr, col: col });
        }

        if (crossedRiver) {
            for (const dc of [-1, 1]) {
                const nc = col + dc;
                if (this.isValidPosition(row, nc)) {
                    const target = this.board[row][nc];
                    if (!target || target.color !== color) moves.push({ row: row, col: nc });
                }
            }
        }
        return moves;
    }

    // ========================================
    // Check and Checkmate Detection
    // ========================================

    /**
     * Check if a player has any legal moves
     * Used for both checkmate and stalemate detection
     */
    hasLegalMoves(board, color) {
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.color === color) {
                    const moves = this.getValidMoves(row, col, piece);
                    if (moves.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    findKing(board, color) {
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.type === 'jiang' && piece.color === color) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    isKingInCheck(board, color) {
        const king = this.findKing(board, color);
        if (!king) return false;

        const oppColor = color === 'red' ? 'black' : 'red';

        // 优先检查飞将（两将在同一列且中间无子）
        const oppKing = this.findKing(board, oppColor);
        if (oppKing && oppKing.col === king.col) {
            let blocked = false;
            const sr = Math.min(king.row, oppKing.row);
            const er = Math.max(king.row, oppKing.row);
            for (let r = sr + 1; r < er; r++) {
                if (board[r][king.col]) { blocked = true; break; }
            }
            if (!blocked) return true;
        }

        // 检查对方所有棋子是否能攻击到己方将/帅
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.color === oppColor) {
                    const moves = this.getRawMoves(board, row, col, piece);
                    if (moves.some(m => m.row === king.row && m.col === king.col)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    getRawMoves(board, row, col, piece) {
        // 注意：这里为了复用各棋子走法生成逻辑，会临时切换 this.board。
        // 为避免异常/重入导致 this.board 未能恢复，使用 try/finally + 栈式恢复。
        if (!this._rawMovesBoardStack) this._rawMovesBoardStack = [];
        
        // 添加栈大小限制，防止无限递归导致的内存溢出
        const MAX_STACK_SIZE = 100;
        if (this._rawMovesBoardStack.length >= MAX_STACK_SIZE) {
            console.error('[getRawMoves] Stack overflow detected, max size:', MAX_STACK_SIZE);
            return [];
        }

        this._rawMovesBoardStack.push(this.board);
        this.board = board;

        try {
            let moves = [];
            switch (piece.type) {
                case 'jiang': moves = this.getJiangBasicMoves(row, col, piece.color); break;
                case 'shi': moves = this.getShiMoves(row, col, piece.color); break;
                case 'xiang': moves = this.getXiangMoves(row, col, piece.color); break;
                case 'ma': moves = this.getMaMoves(row, col, piece.color); break;
                case 'ju': moves = this.getJuMoves(row, col, piece.color); break;
                case 'pao': moves = this.getPaoMoves(row, col, piece.color); break;
                case 'zu': moves = this.getZuMoves(row, col, piece.color); break;
            }
            
            // 添加老将照面（飞将）规则检查：过滤掉会导致两将直接对面的走法
            if (moves.length > 0) {
                const oppColor = piece.color === 'red' ? 'black' : 'red';
                const oppKing = this.findKing(board, oppColor);
                if (oppKing) {
                    moves = moves.filter(move => {
                        // 临时模拟走法
                        const originalTarget = board[move.row][move.col];
                        board[move.row][move.col] = { ...piece };
                        board[row][col] = null;
                        
                        // 检查走法后是否会导致两将对面
                        const king = this.findKing(board, piece.color);
                        let kingsFacing = false;
                        if (king && king.col === oppKing.col) {
                            let blocked = false;
                            const sr = Math.min(king.row, oppKing.row);
                            const er = Math.max(king.row, oppKing.row);
                            for (let r = sr + 1; r < er; r++) {
                                if (board[r][king.col]) { blocked = true; break; }
                            }
                            if (!blocked) kingsFacing = true;
                        }
                        
                        // 恢复棋盘
                        board[row][col] = piece;
                        board[move.row][move.col] = originalTarget;
                        
                        return !kingsFacing;
                    });
                }
            }
            
            return moves;
        } finally {
            try {
                const previous = this._rawMovesBoardStack.pop();
                this.board = previous;
            } catch (e) {
                console.error('[getRawMoves] Stack restoration failed:', e);
                // 尝试恢复到初始状态
                this.board = this._rawMovesBoardStack.length > 0 
                    ? this._rawMovesBoardStack[0] 
                    : this.initializeBoard();
            }
        }
    }

    isCheckmate(board, color) {
        // Checkmate = in check + no legal moves
        // Note: Stalemate (not in check + no legal moves) is handled separately in makeMove()
        if (!this.isKingInCheck(board, color)) {
            return false;
        }
        return !this.hasLegalMoves(board, color);
    }

    isStalemate(board, color) {
        // Stalemate = not in check + no legal moves
        if (this.isKingInCheck(board, color)) {
            return false;
        }
        return !this.hasLegalMoves(board, color);
    }

    // Note: The old isCheckmate function was refactored. It previously handled
    // stalemate detection but that code was unreachable because isCheckmate()
    // was only called when isInCheck was true. Stalemate is now properly
    // detected in makeMove() by calling isStalemate().

    // ========================================
    // Server State Synchronization
    // ========================================

    loadGameState(state) {
        if (!state) return;

        if (state.board && Array.isArray(state.board)) {
            // 防御：服务端 board 必须是 10x9，否则可能导致后续访问越界/崩溃
            // Combine checks into single iteration for efficiency
            let isValidShape = state.board.length === 10;
            if (isValidShape) {
                for (let i = 0; i < state.board.length; i++) {
                    if (!Array.isArray(state.board[i]) || state.board[i].length !== 9) {
                        isValidShape = false;
                        break;
                    }
                }
            }

            if (isValidShape) {
                this.board = this.boardFromServerFormat(state.board);
            } else {
                this.showMessage('⚠️ 收到异常棋盘数据，已跳过同步');
                return;
            }
        }

        this.currentPlayer = state.currentTurn || 'red';
        this.moveCount = state.moveCount || 0;
        this.gameOver = state.status === 'ended';
        this.lastUpdatedAt = state.updatedAt || 0;

        this.isInCheck = this.isKingInCheck(this.board, this.currentPlayer);

        this.renderBoard();
        this.updateTurnIndicator();
    }

    boardFromServerFormat(serverBoard) {
        // Add null/undefined check for serverBoard
        if (!serverBoard || !Array.isArray(serverBoard)) {
            console.error('[boardFromServerFormat] Invalid serverBoard:', serverBoard);
            return this.initializeBoard();
        }

        const pieceMap = {
            'R': { type: 'ju', color: 'red', name: '車' },
            'N': { type: 'ma', color: 'red', name: '馬' },
            'B': { type: 'xiang', color: 'red', name: '相' },
            'A': { type: 'shi', color: 'red', name: '仕' },
            'K': { type: 'jiang', color: 'red', name: '帥' },
            'C': { type: 'pao', color: 'red', name: '炮' },
            'P': { type: 'zu', color: 'red', name: '兵' },
            'r': { type: 'ju', color: 'black', name: '車' },
            'n': { type: 'ma', color: 'black', name: '馬' },
            'b': { type: 'xiang', color: 'black', name: '象' },
            'a': { type: 'shi', color: 'black', name: '士' },
            'k': { type: 'jiang', color: 'black', name: '將' },
            'c': { type: 'pao', color: 'black', name: '砲' },
            'p': { type: 'zu', color: 'black', name: '卒' },
        };

        const board = Array(10).fill(null).map(() => Array(9).fill(null));
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const code = serverBoard[row]?.[col];
                if (code && code !== '.') {
                    const piece = pieceMap[code];
                    // Validate piece structure before adding to board
                    if (piece && piece.type && piece.color && piece.name) {
                        board[row][col] = { ...piece };
                    } else {
                        console.error(`[boardFromServerFormat] Invalid piece structure at [${row},${col}]:`, piece);
                    }
                }
            }
        }
        return board;
    }

    // ========================================
    // Polling
    // ========================================

    startPolling() {
        // 防止重复启动轮询
        if (this.pollTimer) {
            return;
        }
        this.stopPolling();
        this.pollTimer = setInterval(() => this.pollState(), this.pollInterval);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async pollState() {
        if (this._leavingRoom) return;
        if (!this.roomId || !this.playerId) return;
        
        // Add check for gameOver to prevent unnecessary polling after game ends
        if (this.gameOver) return;

        try {
            // Add timeout handling with AbortController
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const res = await fetch(
                `/api/rooms/${this.roomId}/state?since=${this.lastUpdatedAt}&playerId=${this.playerId}`,
                { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);

            if (!res.ok) return;

            const data = await res.json();

            // 再次检查是否正在离开房间，避免在异步操作期间状态改变
            if (this._leavingRoom) return;

            // 更新对手在线状态
            this.updateOpponentStatus(data);

            if (!data.updated) return;

            // 有新数据，同步状态
            const state = data.gameState;
            if (state.updatedAt > this.lastUpdatedAt) {
                this.lastUpdatedAt = state.updatedAt;
                this.loadGameState(state);

                if (state.status === 'ended') {
                    this.gameOver = true;
                    if (state.winner === this.color) {
                        this.showMessage('🏆 你赢了！');
                    } else if (state.winner) {
                        this.showMessage('😔 你输了');
                    }
                    this.stopPolling();
                }
            }
        } catch (error) {
            // Handle AbortError (timeout) separately from other errors
            if (error.name === 'AbortError') {
                console.warn('[Poll] Timeout after 10 seconds, will retry on next interval');
            } else {
                console.error('[Poll] Error:', error);
            }
        }
    }

    updateOpponentStatus(data) {
        const opponentEl = document.getElementById('opponentName');
        if (!opponentEl) {
            console.warn('[updateOpponentStatus] Element "opponentName" not found');
            return;
        }

        const players = data.players || [];
        const opponent = players.find(p => p.color !== this.color);

        if (opponent) {
            opponentEl.textContent = opponent.name || '对手';
        } else if (data.room && data.room.hasRed && data.room.hasBlack) {
            opponentEl.textContent = '对手';
        } else {
            opponentEl.textContent = '等待对手加入...';
        }
    }

    // ========================================
    // Room Actions
    // ========================================

    async createRoom() {
        const roomNameInput = document.getElementById('roomName');
        const roomName = roomNameInput?.value?.trim();

        if (!roomName) {
            this.showMessage('❌ 请输入房间名称');
            return;
        }

        this.showMessage('⏳ 创建房间中...');
        this.setButtonsDisabled(true);

        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName,
                    playerName: '红方玩家'
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || '创建失败');
            }

            const data = await res.json();
            
            // Validate API response
            if (!data || !data.roomId || !data.playerId || !data.color) {
                console.error('[createRoom] Invalid API response:', data);
                throw new Error('服务器返回数据无效');
            }
            
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.color = data.color;
            this.roomName = data.roomName;

            this.saveSession();
            this.board = this.initializeBoard();
            this.currentPlayer = 'red';
            this.gameOver = false;
            this.moveCount = 0;
            this.lastUpdatedAt = Date.now();

            this.switchToGameScreen();
            // 先停止可能存在的轮询，再启动新的轮询，避免重复
            this.stopPolling();
            this.startPolling();
            this.showMessage(`✅ 房间已创建！房间 ID: ${data.roomId.slice(0, 8)}...`);

            // 显示房间 ID 供分享
            this.updateRoomIdDisplay(data.roomId);
        } catch (error) {
            this.showMessage(`❌ ${error.message}`);
        } finally {
            this.setButtonsDisabled(false);
        }
    }

    async joinRoom() {
        const roomIdInput = document.getElementById('joinRoomId');
        const roomInput = roomIdInput?.value?.trim();

        if (!roomInput) {
            this.showMessage('❌ 请输入房间 ID 或名称');
            return;
        }

        this.showMessage('⏳ 加入房间中...');
        this.setButtonsDisabled(true);

        try {
            const res = await fetch(`/api/rooms/${encodeURIComponent(roomInput)}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName: '黑方玩家'
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || '加入失败');
            }

            const data = await res.json();
            
            // Validate join response
            if (!data || !data.roomId || !data.playerId || !data.color) {
                console.error('[joinRoom] Invalid join response:', data);
                throw new Error('服务器返回数据无效');
            }
            
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.color = data.color;
            this.roomName = data.roomName;

            this.saveSession();

            if (data.gameState) {
                this.loadGameState(data.gameState);
            } else {
                this.board = this.initializeBoard();
                this.currentPlayer = 'red';
            }

            this.switchToGameScreen();
            // 先停止可能存在的轮询，再启动新的轮询，避免重复
            this.stopPolling();
            this.startPolling();
            this.showMessage(`✅ 已加入房间 "${data.roomName}"，你是${data.color === 'red' ? '红方' : '黑方'}`);
        } catch (error) {
            this.showMessage(`❌ ${error.message}`);
        } finally {
            this.setButtonsDisabled(false);
        }
    }

    async leaveRoom() {
        // 在停止轮询前设置标志，避免竞态条件
        this._leavingRoom = true;
        this.stopPolling();

        if (this.roomId && this.playerId) {
            try {
                await fetch(`/api/rooms/${this.roomId}/leave`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId: this.playerId })
                });
            } catch (e) {
                // Log errors for debugging
                console.error('[leaveRoom] Failed to leave room:', e);
            }
        }

        sessionStorage.removeItem('chess_session');
        this.resetGame();
        this.switchToLobbyScreen();
        this._leavingRoom = false;
    }

    resetGame() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        this.gameOver = false;
        this.color = null;
        this.roomId = null;
        this.roomName = null;
        this.playerId = null;
        this.moveCount = 0;
        this.lastUpdatedAt = 0;
        this.isInCheck = false;
        this.showMessage('');
    }

    copyRoomId() {
        if (!this.roomId) return;
        
        try {
            navigator.clipboard.writeText(this.roomId).then(() => {
                this.showMessage('✅ 房间 ID 已复制到剪贴板');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = this.roomId;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    this.showMessage('✅ 房间 ID 已复制到剪贴板');
                } catch (err) {
                    this.showMessage('❌ 复制失败，请手动复制');
                }
                document.body.removeChild(textArea);
            });
        } catch (err) {
            this.showMessage('❌ 复制失败，请手动复制');
        }
    }

    handleKeyboardNavigation(e) {
        if (!this.selectedPosition || this.validMoves.length === 0) return;
        
        const { row, col } = this.selectedPosition;
        let newRow = row;
        let newCol = col;
        
        switch (e.key) {
            case 'ArrowUp':
                newRow = Math.max(0, row - 1);
                break;
            case 'ArrowDown':
                newRow = Math.min(9, row + 1);
                break;
            case 'ArrowLeft':
                newCol = Math.max(0, col - 1);
                break;
            case 'ArrowRight':
                newCol = Math.min(8, col + 1);
                break;
            case 'Enter':
            case ' ':
                // Try to move to the first valid move
                if (this.validMoves.length > 0) {
                    const move = this.validMoves[0];
                    this.handleMoveClick(move.row, move.col);
                }
                e.preventDefault();
                return;
            case 'Escape':
                // Deselect piece
                this.selectedPiece = null;
                this.selectedPosition = null;
                this.validMoves = [];
                this.renderBoard();
                e.preventDefault();
                return;
            default:
                return;
        }
        
        e.preventDefault();
        
        // Check if the new position is a valid move
        const isValidMove = this.validMoves.some(move => move.row === newRow && move.col === newCol);
        if (isValidMove) {
            this.handleMoveClick(newRow, newCol);
        }
    }

    // ========================================
    // UI Helpers
    // ========================================

    switchToGameScreen() {
        const lobby = document.getElementById('lobby');
        const game = document.getElementById('game');

        if (lobby) lobby.classList.add('hidden');
        if (game) game.classList.remove('hidden');

        this.renderBoard();
        this.updateTurnIndicator();
    }

    switchToLobbyScreen() {
        const lobby = document.getElementById('lobby');
        const game = document.getElementById('game');

        if (game) game.classList.add('hidden');
        if (lobby) lobby.classList.remove('hidden');
    }

    updateTurnIndicator() {
        const indicator = document.getElementById('turnIndicator');
        if (!indicator) return;

        requestAnimationFrame(() => {
            if (this.gameOver) {
                indicator.textContent = '游戏结束';
                indicator.className = 'game-over';
            } else if (this.currentPlayer === this.color) {
                indicator.textContent = this.isInCheck ? '⚠️ 你的回合（将军！）' : '你的回合';
                indicator.className = this.isInCheck ? 'your-turn check' : 'your-turn';
            } else {
                indicator.textContent = '对手回合';
                indicator.className = 'opponent-turn';
            }
        });
    }

    updateRoomIdDisplay(roomId) {
        const display = document.getElementById('roomIdDisplay');
        if (display) {
            requestAnimationFrame(() => {
                display.textContent = roomId;
                display.parentElement.classList.remove('hidden');
            });
        }
    }

    setButtonsDisabled(disabled) {
        const btns = document.querySelectorAll('#lobby button');
        btns.forEach(btn => btn.disabled = disabled);
    }

    showMessage(message) {
        const lobbyMessage = document.getElementById('lobbyMessage');
        const gameMessage = document.getElementById('gameMessage');

        if (lobbyMessage) {
            // Force aria-live region update by temporarily removing and re-adding content
            lobbyMessage.textContent = '';
            lobbyMessage.setAttribute('aria-live', 'off');
            
            // Use setTimeout to ensure screen readers notice the change
            setTimeout(() => {
                lobbyMessage.textContent = message;
                lobbyMessage.setAttribute('aria-live', 'polite');
                lobbyMessage.classList.toggle('hidden', !message);
            }, 10);
        }
        if (gameMessage) {
            // Force aria-live region update by temporarily removing and re-adding content
            gameMessage.textContent = '';
            gameMessage.setAttribute('aria-live', 'off');
            
            // Use setTimeout to ensure screen readers notice the change
            setTimeout(() => {
                gameMessage.textContent = message;
                gameMessage.setAttribute('aria-live', 'assertive');
                gameMessage.classList.toggle('hidden', !message);
            }, 10);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.game = new ChineseChess();
        
        // 添加页面卸载时的清理逻辑
        window.addEventListener('beforeunload', () => {
            if (window.game) {
                window.game.cleanup();
            }
        });
        
        // 全局错误处理
        window.addEventListener('error', (event) => {
            console.error('[Global Error]', event.error);
            // 可以在这里添加错误上报逻辑
        });
    } catch (error) {
        console.error('[Initialization Error]', error);
        document.body.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; text-align: center; padding: 20px;">
                <h2 style="color: #dc3545;">游戏初始化失败</h2>
                <p style="color: #6c757d; margin-top: 10px;">请刷新页面重试</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 10px; cursor: pointer;">刷新页面</button>
            </div>
        `;
    }
});
