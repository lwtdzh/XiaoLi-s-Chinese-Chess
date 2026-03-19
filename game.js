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

        // Initialize
        this.initUI();
        this.restoreSession();
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
            } catch (e) { /* ignore */ }
        }
    }

    restoreSession() {
        try {
            const saved = sessionStorage.getItem('chess_session');
            if (!saved) return;
            const session = JSON.parse(saved);
            if (session.roomId && session.playerId) {
                this.showMessage('⏳ 正在恢复上次游戏...');
                // 避免在初始化阶段重复触发 join/poll，确保只恢复一次
                if (this._restoringSession) return;
                this._restoringSession = true;
                this.rejoinRoom(session)
                    .catch((e) => {
                        console.error('[Session Restore] Error:', e);
                        sessionStorage.removeItem('chess_session');
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
        
        // Clear session
        sessionStorage.removeItem('chess_session');
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

        if (createBtn) this.addTrackedEventListener(createBtn, 'click', () => this.createRoom());
        if (joinBtn) this.addTrackedEventListener(joinBtn, 'click', () => this.joinRoom());
        if (leaveBtn) this.addTrackedEventListener(leaveBtn, 'click', () => this.leaveRoom());
    }

    // ========================================
    // Board Rendering
    // ========================================

    renderBoard() {
        const boardElement = document.getElementById('chessBoard');
        if (!boardElement) return;

        boardElement.innerHTML = '';
        this.drawBoardLines(boardElement);

        // 棋盘格子间距和偏移量
        const cellSize = 44;
        const offsetX = 20; // 棋子中心 X 偏移
        const offsetY = 22; // 棋子中心 Y 偏移
        const pieceRadius = 20; // 棋子半径

        // 移除之前棋盘上所有棋子和合法走法标记的事件监听器
        // 避免在频繁渲染时累积监听器导致内存泄漏
        this.eventListeners = this.eventListeners.filter(({ element }) => {
            return !boardElement.contains(element);
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

                    this.addTrackedEventListener(el, 'click', () => this.handlePieceClick(row, col));
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
            this.addTrackedEventListener(dot, 'click', () => this.handleMoveClick(move.row, move.col));
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

    drawBoardLines(boardElement) {
        for (let i = 0; i < 10; i++) {
            const line = document.createElement('div');
            line.className = 'board-line horizontal';
            line.style.top = `${i * 44 + 22}px`;
            boardElement.appendChild(line);
        }

        for (let i = 0; i < 9; i++) {
            const line = document.createElement('div');
            line.className = 'board-line vertical';
            line.style.left = `${i * 44 + 20}px`;
            boardElement.appendChild(line);
        }

        const river = document.createElement('div');
        river.className = 'river';
        river.textContent = '楚河        漢界';
        boardElement.appendChild(river);

        this.drawPalaceLines(boardElement);
    }

    drawPalaceLines(boardElement) {
        const palaceLines = [
            { left: '152px', top: '22px', transform: 'rotate(47deg)', height: '128px', origin: 'top left' },
            { left: '240px', top: '22px', transform: 'rotate(-47deg)', height: '128px', origin: 'top right' },
            { left: '152px', top: '374px', transform: 'rotate(-47deg)', height: '128px', origin: 'top left' },
            { left: '240px', top: '374px', transform: 'rotate(47deg)', height: '128px', origin: 'top right' }
        ];

        palaceLines.forEach(config => {
            const line = document.createElement('div');
            line.className = 'board-line palace-line';
            line.style.left = config.left;
            line.style.top = config.top;
            line.style.width = '2px';
            line.style.height = config.height;
            line.style.transform = config.transform;
            line.style.transformOrigin = config.origin;
            boardElement.appendChild(line);
        });
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

        // 保存状态用于回滚
        const previousBoard = JSON.parse(JSON.stringify(this.board));
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
            this.isInCheck = this.isKingInCheck(this.board, this.currentPlayer);
            if (this.isInCheck) {
                if (this.isCheckmate(this.board, this.currentPlayer)) {
                    this.gameOver = true;
                    this.showMessage(`🏆 将杀！${piece.color === 'red' ? '红方' : '黑方'}获胜！`);
                } else {
                    this.showMessage('⚠️ 将军！');
                }
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
                    // 立即触发一次轮询以获取最新状态
                    await this.pollState();
                    // 回滚本地状态，使用之前保存的旧状态而不是乐观更新后的状态
                    this.moveCount--;
                    this.board = previousBoard;
                    this.currentPlayer = previousTurn;
                    this.isInCheck = previousCheck;
                    this.gameOver = false;
                    this.renderBoard();
                    this.updateTurnIndicator();
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
            this.board = previousBoard;
            this.currentPlayer = previousTurn;
            this.isInCheck = previousCheck;
            this.gameOver = false;
            this.moveCount--;
            this.renderBoard();
            this.updateTurnIndicator();
            this.showMessage(`❌ ${error.message}`);
        }
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
            const testBoard = JSON.parse(JSON.stringify(this.board));
            testBoard[move.row][move.col] = testBoard[row][col];
            testBoard[row][col] = null;
            return !this.isKingInCheck(testBoard, piece.color);
        });
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }

    getJiangMoves(row, col, color) {
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
            return moves;
        } finally {
            const previous = this._rawMovesBoardStack.pop();
            this.board = previous;
        }
    }

    isCheckmate(board, color) {
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.color === color) {
                    const originalBoard = this.board;
                    try {
                        this.board = board;
                        const moves = this.getValidMoves(row, col, piece);
                        if (moves.length > 0) return false;
                    } finally {
                        this.board = originalBoard;
                    }
                }
            }
        }
        return true;
    }

    // ========================================
    // Server State Synchronization
    // ========================================

    loadGameState(state) {
        if (!state) return;

        if (state.board && Array.isArray(state.board)) {
            // 防御：服务端 board 必须是 10x9，否则可能导致后续访问越界/崩溃
            const isValidShape =
                state.board.length === 10 &&
                state.board.every(r => Array.isArray(r) && r.length === 9);

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
                    if (piece) board[row][col] = { ...piece };
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

        try {
            const res = await fetch(
                `/api/rooms/${this.roomId}/state?since=${this.lastUpdatedAt}&playerId=${this.playerId}`
            );

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
            console.error('[Poll] Error:', error);
        }
    }

    updateOpponentStatus(data) {
        const opponentEl = document.getElementById('opponentName');
        if (!opponentEl) return;

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
        this.stopPolling();
        this._leavingRoom = true;

        if (this.roomId && this.playerId) {
            try {
                await fetch(`/api/rooms/${this.roomId}/leave`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId: this.playerId })
                });
            } catch (e) { /* best effort */ }
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
    }

    updateRoomIdDisplay(roomId) {
        const display = document.getElementById('roomIdDisplay');
        if (display) {
            display.textContent = roomId;
            display.parentElement.classList.remove('hidden');
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
            lobbyMessage.textContent = message;
            lobbyMessage.classList.toggle('hidden', !message);
        }
        if (gameMessage) {
            gameMessage.textContent = message;
            gameMessage.classList.toggle('hidden', !message);
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
