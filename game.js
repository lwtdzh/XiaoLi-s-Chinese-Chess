
// Chinese Chess Frontend - Enhanced Version with Reconnection and Error Handling

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
        this.moveCount = 0;
        
        // Player info
        this.opponentName = 'Waiting...';
        this.myName = 'You';
        
        // WebSocket state
        this.socket = null;
        this.connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'reconnecting'
        
        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        
        // Heartbeat
        this.heartbeatInterval = null;
        this.heartbeatTimeout = 20000;
        this.lastHeartbeat = 0;
        this.missedHeartbeats = 0;
        this.maxMissedHeartbeats = 3;
        
        // Move state
        this.pendingMove = null;
        this.lastKnownUpdate = 0;
        this.movePollingInterval = null;
        this.opponentPollingInterval = null;
        
        // Check state
        this.isInCheck = false;
        this.checkWarningShown = false;
        
        // Initialize
        this.initUI();
        // 不在构造函数中自动连接 WebSocket，而是在 createRoom/joinRoom 时才连接
        // this.connectWebSocket();
        this.updateConnectionStatus('idle');
    }

    // ========================================
    // Board Initialization
    // ========================================
    
    initializeBoard() {
        const board = Array(10).fill(null).map(() => Array(9).fill(null));
        
        // Black pieces (top)
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

        // Red pieces (bottom)
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
        
        console.log('=== Setting up event listeners ===');
        
        if (!createBtn) {
            console.error('❌ Create button not found!');
            return;
        }
        if (!joinBtn) {
            console.error('❌ Join button not found!');
            return;
        }
        if (!leaveBtn) {
            console.error('❌ Leave button not found!');
            return;
        }
        
        createBtn.addEventListener('click', () => {
            console.log('🔴 Create button clicked');
            this.createRoom();
        });
        
        joinBtn.addEventListener('click', () => {
            console.log('🟢 Join button clicked');
            this.joinRoom();
        });
        
        leaveBtn.addEventListener('click', () => {
            console.log('🔵 Leave button clicked');
            this.leaveRoom();
        });
        
        console.log('✅ Event listeners set up successfully');
    }

    // ========================================
    // Board Rendering
    // ========================================
    
    renderBoard() {
        const boardElement = document.getElementById('chessBoard');
        if (!boardElement) {
            console.error('Board element not found');
            return;
        }
        
        boardElement.innerHTML = '';

        // Draw board lines
        this.drawBoardLines(boardElement);

        // Draw pieces
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    const pieceElement = this.createPieceElement(piece, row, col);
                    boardElement.appendChild(pieceElement);
                }
            }
        }

        // Draw valid moves
        this.validMoves.forEach(move => {
            const moveElement = document.createElement('div');
            moveElement.className = 'valid-move';
            moveElement.style.left = `${move.col * 44 + 30}px`;
            moveElement.style.top = `${move.row * 44 + 30}px`;
            moveElement.addEventListener('click', () => this.handleMoveClick(move.row, move.col));
            boardElement.appendChild(moveElement);
        });
        
        // Show check indicator if in check
        if (this.isInCheck) {
            this.highlightKingInCheck(boardElement);
        }
    }
    
    createPieceElement(piece, row, col) {
        const pieceElement = document.createElement('div');
        pieceElement.className = `chess-piece ${piece.color}`;
        pieceElement.textContent = piece.name;
        pieceElement.style.left = `${col * 44 + 10}px`;
        pieceElement.style.top = `${row * 44 + 10}px`;
        pieceElement.dataset.row = row;
        pieceElement.dataset.col = col;
        
        if (this.selectedPosition && 
            this.selectedPosition.row === row && 
            this.selectedPosition.col === col) {
            pieceElement.classList.add('selected');
        }
        
        pieceElement.addEventListener('click', () => this.handlePieceClick(row, col));
        return pieceElement;
    }
    
    highlightKingInCheck(boardElement) {
        // Find the king that's in check
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === 'jiang' && piece.color === this.currentPlayer) {
                    // Add check indicator
                    const checkIndicator = document.createElement('div');
                    checkIndicator.className = 'check-indicator';
                    checkIndicator.style.left = `${col * 44 + 10}px`;
                    checkIndicator.style.top = `${row * 44 + 10}px`;
                    checkIndicator.style.width = '40px';
                    checkIndicator.style.height = '40px';
                    checkIndicator.style.borderRadius = '50%';
                    checkIndicator.style.border = '3px solid #ff0000';
                    checkIndicator.style.position = 'absolute';
                    checkIndicator.style.animation = 'pulse 1s infinite';
                    boardElement.appendChild(checkIndicator);
                }
            }
        }
    }

    drawBoardLines(boardElement) {
        // Horizontal lines
        for (let i = 0; i < 10; i++) {
            const line = document.createElement('div');
            line.className = 'board-line horizontal';
            line.style.top = `${i * 44 + 22}px`;
            boardElement.appendChild(line);
        }

        // Vertical lines
        for (let i = 0; i < 9; i++) {
            const line = document.createElement('div');
            line.className = 'board-line vertical';
            line.style.left = `${i * 44 + 20}px`;
            boardElement.appendChild(line);
        }

        // River text
        const river = document.createElement('div');
        river.className = 'river';
        river.textContent = '楚河        漢界';
        boardElement.appendChild(river);

        // Palace diagonal lines
        this.drawPalaceLines(boardElement);
    }
    
    drawPalaceLines(boardElement) {
        const palaceLines = [
            { left: '162px', top: '22px', transform: 'rotate(45deg)', origin: 'top left' },
            { left: '246px', top: '22px', transform: 'rotate(-45deg)', origin: 'top right' },
            { left: '162px', top: '312px', transform: 'rotate(-45deg)', origin: 'top left' },
            { left: '246px', top: '312px', transform: 'rotate(45deg)', origin: 'top right' }
        ];
        
        palaceLines.forEach(config => {
            const line = document.createElement('div');
            line.className = 'board-line';
            line.style.left = config.left;
            line.style.top = config.top;
            line.style.width = '2px';
            line.style.height = '132px';
            line.style.transform = config.transform;
            line.style.transformOrigin = config.origin;
            boardElement.appendChild(line);
        });
    }

    // ========================================
    // Game Logic
    // ========================================
    
    handlePieceClick(row, col) {
        if (this.gameOver) {
            this.showMessage('Game is over!');
            return;
        }
        
        if (this.currentPlayer !== this.color) {
            this.showMessage('Wait for your turn');
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
        return this.validMoves.some(move => move.row === row && move.col === col);
    }

    makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];

        // Save state for potential rollback
        this.pendingMove = {
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: piece,
            capturedPiece: capturedPiece,
            previousBoard: JSON.parse(JSON.stringify(this.board)),
            previousTurn: this.currentPlayer,
            previousCheckState: this.isInCheck
        };

        // Apply move optimistically
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        
        // Switch turn
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        
        // Check for game over
        if (capturedPiece && capturedPiece.type === 'jiang') {
            this.gameOver = true;
            this.showMessage(`🏆 ${piece.color === 'red' ? 'Red' : 'Black'} wins!`);
        } else {
            // Check if opponent is in check
            this.isInCheck = this.isKingInCheck(this.board, this.currentPlayer);
            
            if (this.isInCheck) {
                if (this.isCheckmate(this.board, this.currentPlayer)) {
                    this.gameOver = true;
                    this.showMessage(`🏆 Checkmate! ${piece.color === 'red' ? 'Red' : 'Black'} wins!`);
                } else {
                    this.showMessage('⚠️ Check!');
                }
            }
        }
        
        this.moveCount++;
        this.renderBoard();
        this.updateTurnIndicator();

        // Send move to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'move',
                from: { row: fromRow, col: fromCol },
                to: { row: toRow, col: toCol },
                roomId: this.roomId
            }));
        } else {
            this.showMessage('⚠️ Not connected! Move may not be saved.');
            this.attemptReconnect();
        }
    }
    
    rollbackMove() {
        if (!this.pendingMove) return;
        
        console.log('Rolling back move...');
        
        const { previousBoard, previousTurn, previousCheckState } = this.pendingMove;
        this.board = previousBoard;
        this.currentPlayer = previousTurn;
        this.isInCheck = previousCheckState;
        this.gameOver = false;
        this.pendingMove = null;
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
            case 'jiang': moves = this.getJiangMoves(row, col, piece.color); break;
            case 'shi': moves = this.getShiMoves(row, col, piece.color); break;
            case 'xiang': moves = this.getXiangMoves(row, col, piece.color); break;
            case 'ma': moves = this.getMaMoves(row, col, piece.color); break;
            case 'ju': moves = this.getJuMoves(row, col, piece.color); break;
            case 'pao': moves = this.getPaoMoves(row, col, piece.color); break;
            case 'zu': moves = this.getZuMoves(row, col, piece.color); break;
        }

        // Filter moves that would leave own king in check
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
        const minCol = 3;
        const maxCol = 5;

        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
                const target = this.board[newRow][newCol];
                if (!target || target.color !== color) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }

        // Flying general rule
        const opponentColor = color === 'red' ? 'black' : 'red';
        for (let r = 0; r < 10; r++) {
            if (this.board[r][col] && this.board[r][col].type === 'jiang' && this.board[r][col].color === opponentColor) {
                let blocked = false;
                const startRow = Math.min(row, r);
                const endRow = Math.max(row, r);
                
                for (let checkRow = startRow + 1; checkRow < endRow; checkRow++) {
                    if (this.board[checkRow][col]) {
                        blocked = true;
                        break;
                    }
                }
                
                if (!blocked) {
                    moves.push({ row: r, col: col });
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
        const minCol = 3;
        const maxCol = 5;

        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (newRow >= minRow && newRow <= maxRow && newCol >= minCol && newCol <= maxCol) {
                const target = this.board[newRow][newCol];
                if (!target || target.color !== color) {
                    moves.push({ row: newRow, col: newCol });
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
            const newRow = row + dr;
            const newCol = col + dc;
            const blockRow = row + br;
            const blockCol = col + bc;

            if (!this.isValidPosition(newRow, newCol)) continue;
            
            // Cannot cross river
            if (color === 'red' && newRow < 5) continue;
            if (color === 'black' && newRow > 4) continue;
            
            // Check if blocked
            if (!this.board[blockRow][blockCol]) {
                const target = this.board[newRow][newCol];
                if (!target || target.color !== color) {
                    moves.push({ row: newRow, col: newCol });
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
            const newRow = row + jump.move[0];
            const newCol = col + jump.move[1];
            const blockRow = row + jump.block[0];
            const blockCol = col + jump.block[1];

            if (!this.isValidPosition(newRow, newCol)) continue;
            
            // Check if blocked (蹩马腿)
            if (this.board[blockRow] && this.board[blockRow][blockCol]) continue;
            
            const target = this.board[newRow][newCol];
            if (!target || target.color !== color) {
                moves.push({ row: newRow, col: newCol });
            }
        }

        return moves;
    }

    getJuMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;

            while (this.isValidPosition(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                if (!target) {
                    moves.push({ row: newRow, col: newCol });
                } else {
                    if (target.color !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    break;
                }
                newRow += dr;
                newCol += dc;
            }
        }

        return moves;
    }

    getPaoMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;
            let jumped = false;

            while (this.isValidPosition(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                
                if (!jumped) {
                    if (!target) {
                        moves.push({ row: newRow, col: newCol });
                    } else {
                        jumped = true;
                    }
                } else {
                    if (target) {
                        if (target.color !== color) {
                            moves.push({ row: newRow, col: newCol });
                        }
                        break;
                    }
                }
                newRow += dr;
                newCol += dc;
            }
        }

        return moves;
    }

    getZuMoves(row, col, color) {
        const moves = [];
        const forward = color === 'red' ? -1 : 1;
        const crossedRiver = color === 'red' ? row <= 4 : row >= 5;

        // Forward move
        const newRow = row + forward;
        if (this.isValidPosition(newRow, col)) {
            const target = this.board[newRow][col];
            if (!target || target.color !== color) {
                moves.push({ row: newRow, col: col });
            }
        }

        // Sideways after crossing river
        if (crossedRiver) {
            for (const dc of [-1, 1]) {
                const newCol = col + dc;
                if (this.isValidPosition(row, newCol)) {
                    const target = this.board[row][newCol];
                    if (!target || target.color !== color) {
                        moves.push({ row: row, col: newCol });
                    }
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

        const opponentColor = color === 'red' ? 'black' : 'red';

        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.color === opponentColor) {
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
        // Get moves without check filtering (for check detection)
        const originalBoard = this.board;
        this.board = board;
        
        let moves = [];
        switch (piece.type) {
            case 'jiang': moves = this.getJiangMoves(row, col, piece.color); break;
            case 'shi': moves = this.getShiMoves(row, col, piece.color); break;
            case 'xiang': moves = this.getXiangMoves(row, col, piece.color); break;
            case 'ma': moves = this.getMaMoves(row, col, piece.color); break;
            case 'ju': moves = this.getJuMoves(row, col, piece.color); break;
            case 'pao': moves = this.getPaoMoves(row, col, piece.color); break;
            case 'zu': moves = this.getZuMoves(row, col, piece.color); break;
        }
        
        this.board = originalBoard;
        return moves;
    }

    isCheckmate(board, color) {
        // Check if any piece of the given color has valid moves
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = board[row][col];
                if (piece && piece.color === color) {
                    const moves = this.getValidMovesForCheckmate(board, row, col, piece);
                    if (moves.length > 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    getValidMovesForCheckmate(board, row, col, piece) {
        const originalBoard = this.board;
        this.board = board;
        
        const moves = this.getValidMoves(row, col, piece);
        
        this.board = originalBoard;
        return moves;
    }

    // ========================================
    // WebSocket Connection
    // ========================================
    
    connectWebSocket(roomId = null) {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            return;
        }
        
        this.connectionState = 'connecting';
        this.updateConnectionStatus('connecting');
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${window.location.host}/ws`;
        
        // Include roomId in URL if we have one (for reconnection or joining)
        if (roomId || this.roomId) {
            wsUrl += `?roomId=${roomId || this.roomId}`;
        }
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('✅ WebSocket connected');
                this.connectionState = 'connected';
                this.reconnectAttempts = 0;
                this.missedHeartbeats = 0;
                this.updateConnectionStatus('connected');
                this.startHeartbeat();
                
                // Send join message with room name and player name
                if (this.roomId) {
                    this.socket.send(JSON.stringify({
                        type: 'join',
                        roomId: this.roomId,
                        roomName: this.roomName || this.roomId,
                        playerName: this.myName || 'Player'
                    }));
                }
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                    // Don't let individual message failures kill the connection
                }
            };
            
            this.socket.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                
                // 竞态修复：如果是我们主动关闭旧 socket，忽略此事件
                if (this._isClosingOldSocket) {
                    this._isClosingOldSocket = false;
                    return;
                }
                
                this.connectionState = 'disconnected';
                this.stopHeartbeat();
                this.updateConnectionStatus('disconnected');
                
                // 只在意外关闭且已有 roomId 时才尝试重连
                if (event.code !== 1000 && event.code !== 1001 && this.roomId) {
                    this.attemptReconnect();
                }
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionState = 'disconnected';
                this.updateConnectionStatus('disconnected');
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.connectionState = 'disconnected';
            this.updateConnectionStatus('disconnected');
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        // 没有 roomId 时不应该重连
        if (!this.roomId) {
            console.log('No room ID, skipping reconnect');
            return;
        }
        
        if (this.connectionState === 'reconnecting') {
            return;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showMessage('❌ Connection lost. Please refresh the page.');
            return;
        }
        
        this.connectionState = 'reconnecting';
        this.reconnectAttempts++;
        
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );
        
        this.showMessage(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.updateConnectionStatus('reconnecting');
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    // ========================================
    // Heartbeat
    // ========================================
    
    startHeartbeat() {
        this.stopHeartbeat();
        
        this.lastHeartbeat = Date.now();
        
        this.heartbeatInterval = setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                return;
            }
            
            const now = Date.now();
            const elapsed = now - this.lastHeartbeat;
            
            if (elapsed > this.heartbeatTimeout) {
                this.missedHeartbeats++;
                console.log(`Missed heartbeat (${this.missedHeartbeats}/${this.maxMissedHeartbeats})`);
                
                if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
                    console.log('Too many missed heartbeats, reconnecting...');
                    this.stopHeartbeat();
                    this.socket.close();
                    this.attemptReconnect();
                    return;
                }
            }
            
            // Send ping
            try {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            } catch (error) {
                console.error('Failed to send ping:', error);
            }
        }, this.heartbeatTimeout);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // ========================================
    // Message Handling
    // ========================================
    
    handleMessage(data) {
        console.log('Received message:', data.type);
        
        switch (data.type) {
            // New DO message types
            case 'session':
                this.handleSession(data);
                break;
            case 'joined':
                this.handleJoined(data);
                break;
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
            case 'move':
                this.handleMove(data);
                break;
            case 'game_restarted':
                this.handleGameRestarted(data);
                break;
            case 'game_ended':
                this.handleGameEnded(data);
                break;
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
            case 'player_ready':
                this.handlePlayerReady(data);
                break;
            case 'chat':
                this.handleChat(data);
                break;
            
            // Legacy message types (for backwards compatibility)
            case 'roomCreated':
                this.handleRoomCreated(data);
                break;
            case 'roomJoined':
                this.handleRoomJoined(data);
                break;
            case 'opponentFound':
                this.handlePlayerJoined(data);
                break;
            case 'moveConfirmed':
                this.handleMoveConfirmed(data);
                break;
            case 'moveRejected':
                this.handleMoveRejected(data);
                break;
            case 'moveUpdate':
                this.handleMoveUpdate(data);
                break;
            case 'gameOver':
                this.handleGameOver(data);
                break;
            case 'opponentDisconnected':
                this.handlePlayerLeft(data);
                break;
            case 'rejoined':
                this.handleRejoined(data);
                break;
            case 'error':
                this.handleError(data);
                break;
            case 'pong':
                this.lastHeartbeat = Date.now();
                this.missedHeartbeats = 0;
                break;
            case 'ping':
                this.socket.send(JSON.stringify({ type: 'pong' }));
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }
    
    // New DO handlers
    handleSession(data) {
        this.sessionId = data.sessionId;
        console.log('✅ Session established:', this.sessionId);
    }
    
    handleJoined(data) {
        this.roomId = data.roomId;
        this.roomName = data.roomName;
        this.color = data.color;
        this.myName = data.playerName || 'You';
        
        if (data.gameState) {
            this.loadGameState(data.gameState);
        }
        
        this.showMessage(`✅ Joined room "${data.roomName}" as ${data.color === 'red' ? 'Red' : 'Black'} player`);
        this.switchToGameScreen();
    }
    
    handleMove(data) {
        // Check if this is our own move being echoed back
        if (data.moved_by === this.color) {
            // This is our own move, already applied optimistically, just confirm it
            console.log('✅ Our move confirmed by server');
            return;
        }
        
        // Opponent made a move
        if (data.current_turn === this.color) {
            // It's now my turn, the move was made by opponent
            this.applyOpponentMove(data);
        }
    }
    
    handleGameRestarted(data) {
        if (data.gameState) {
            this.loadGameState(data.gameState);
        }
        this.showMessage('🔄 Game restarted!');
        this.renderBoard();
        this.updateTurnIndicator();
    }
    
    handleGameEnded(data) {
        this.gameOver = true;
        const winner = data.winner === this.color ? 'You' : 'Opponent';
        
        if (data.reason === 'resign') {
            this.showMessage(`🏆 ${winner} won! Opponent resigned.`);
        } else {
            this.showMessage(`🏆 Game Over! ${winner} won!`);
        }
        
        this.renderBoard();
        this.updateTurnIndicator();
    }
    
    handlePlayerReady(data) {
        console.log('Player ready:', data.color);
    }
    
    handleChat(data) {
        console.log(`[Chat] ${data.playerName}: ${data.message}`);
        // Could display in a chat UI if implemented
    }
    
    loadGameState(state) {
        if (!state) return;
        
        // Convert board format from DO (letters) to frontend format
        if (state.board && Array.isArray(state.board)) {
            this.board = this.boardFromServerFormat(state.board);
        }
        this.currentPlayer = state.current_turn || 'red';
        this.moveCount = state.move_count || 0;
        this.gameOver = state.status === 'ended';
        
        // Check for check state
        if (this.currentPlayer === this.color) {
            this.isInCheck = this.isKingInCheck(this.board, this.color);
        }
    }
    
    boardFromServerFormat(serverBoard) {
        const pieceMap = {
            // Red pieces (uppercase in server format)
            'R': { type: 'ju', color: 'red', name: '車' },
            'N': { type: 'ma', color: 'red', name: '馬' },
            'B': { type: 'xiang', color: 'red', name: '相' },
            'A': { type: 'shi', color: 'red', name: '仕' },
            'K': { type: 'jiang', color: 'red', name: '帥' },
            'C': { type: 'pao', color: 'red', name: '炮' },
            'P': { type: 'zu', color: 'red', name: '兵' },
            // Black pieces (lowercase in server format)
            'r': { type: 'ju', color: 'black', name: '車' },
            'n': { type: 'ma', color: 'black', name: '馬' },
            'b': { type: 'xiang', color: 'black', name: '象' },
            'a': { type: 'shi', color: 'black', name: '士' },
            'k': { type: 'jiang', color: 'black', name: '將' },
            'c': { type: 'pao', color: 'black', name: '砲' },
            'p': { type: 'zu', color: 'black', name: '卒' },
            '.': null
        };
        
        const board = Array(10).fill(null).map(() => Array(9).fill(null));
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const code = serverBoard[row]?.[col];
                if (code && code !== '.') {
                    const piece = pieceMap[code];
                    if (piece) {
                        board[row][col] = { ...piece };
                    }
                }
            }
        }
        
        return board;
    }
    
    applyOpponentMove(data) {
        if (data.from && data.to) {
            const piece = this.board[data.from.row][data.from.col];
            if (piece) {
                this.board[data.to.row][data.to.col] = piece;
                this.board[data.from.row][data.from.col] = null;
            }
        }
        
        this.currentPlayer = data.current_turn || (this.color === 'red' ? 'red' : 'black');
        this.moveCount = data.move_count || this.moveCount + 1;
        
        // Check game status
        if (data.game_status === 'ended') {
            this.gameOver = true;
            this.showMessage(data.winner === this.color ? '🏆 You won!' : '🏆 You lost!');
        } else {
            // Check if we're in check
            this.isInCheck = this.isKingInCheck(this.board, this.color);
            if (this.isInCheck) {
                this.showMessage('⚠️ You are in check!');
            }
        }
        
        this.renderBoard();
        this.updateTurnIndicator();
    }
    
    handleRoomCreated(data) {
        this.roomId = data.roomId;
        this.color = data.color;
        this.showMessage(`✅ Room created! ID: ${data.roomId}`);
        this.switchToGameScreen();
    }
    
    handleRoomJoined(data) {
        this.roomId = data.roomId;
        this.color = data.color;
        this.opponentName = data.opponentName || 'Opponent';
        document.getElementById('opponentName').textContent = this.opponentName;
        this.showMessage('✅ Joined room!');
        this.switchToGameScreen();
    }
    
    handlePlayerJoined(data) {
        this.opponentName = data.playerName || 'Opponent';
        document.getElementById('opponentName').textContent = this.opponentName;
        this.showMessage(`✅ ${this.opponentName} joined!`);
        this.stopOpponentPolling();
    }
    
    handleMoveConfirmed(data) {
        this.pendingMove = null;
        console.log('✅ Move confirmed by server');
    }
    
    handleMoveRejected(data) {
        const msg = data.error || data.message || 'Invalid move';
        console.error('❌ Move rejected:', msg);
        this.rollbackMove();
        this.showMessage(`❌ Move rejected: ${msg}`);
    }
    
    handleMoveUpdate(data) {
        if (data.updatedAt && data.updatedAt <= this.lastKnownUpdate) {
            return;
        }
        
        this.lastKnownUpdate = data.updatedAt;
        
        if (data.from && data.to && data.current_turn === this.color) {
            this.applyOpponentMove(data);
        }
    }
    
    handleGameOver(data) {
        this.gameOver = true;
        const winner = data.winner === 'red' ? 'Red' : 'Black';
        
        if (data.reason === 'checkmate') {
            this.showMessage(`🏆 Checkmate! ${winner} wins!`);
        } else if (data.reason === 'resign') {
            this.showMessage(`🏆 ${winner} wins! Opponent resigned.`);
        } else {
            this.showMessage(`🏆 Game Over! ${winner} wins!`);
        }
        
        this.renderBoard();
        this.updateTurnIndicator();
    }
    
    handlePlayerLeft(data) {
        this.showMessage('⚠️ Opponent disconnected');
        if (!this.gameOver) {
            // Give them time to reconnect
            setTimeout(() => {
                if (!this.gameOver) {
                    this.showMessage('⚠️ Waiting for opponent to reconnect...');
                }
            }, 2000);
        }
    }
    
    handleRejoined(data) {
        console.log('✅ Rejoined room successfully');
        this.roomId = data.roomId;
        this.color = data.color;
        
        if (data.board) {
            this.board = data.board;
            this.currentPlayer = data.currentTurn;
            this.moveCount = data.moveCount || 0;
        }
        
        this.renderBoard();
        this.updateTurnIndicator();
        this.showMessage('✅ Reconnected!');
    }
    
    handleError(data) {
        console.error('Server error:', data);
        this.showMessage(`❌ Error: ${data.message || 'Unknown error'}`);
    }

    // ========================================
    // Room Actions
    // ========================================
    
    createRoom() {
        const roomNameInput = document.getElementById('roomName');
        const roomName = roomNameInput?.value?.trim();
        
        console.log('Creating room:', roomName);
        
        if (!roomName) {
            this.showMessage('❌ Please enter a room name');
            return;
        }
        
        // 竞态修复：在关闭旧 socket 前设置标志，防止 onclose 回调干扰新连接
        if (this.socket) {
            this.stopHeartbeat();
            this._isClosingOldSocket = true;
            this.socket.close();
        }
        
        this.roomName = roomName;
        this.pendingRoomAction = 'create';
        
        // Generate a unique room ID
        this.roomId = 'room-' + crypto.randomUUID();
        
        // Connect WebSocket with room ID
        this.connectionState = 'disconnected';
        this.connectWebSocket(this.roomId);
        
        this.showMessage('⏳ Creating room...');
    }

    joinRoom() {
        const roomIdInput = document.getElementById('joinRoomId');
        const roomId = roomIdInput?.value?.trim();
        
        console.log('Joining room:', roomId);
        
        if (!roomId) {
            this.showMessage('❌ Please enter a room ID');
            return;
        }
        
        // 竞态修复：在关闭旧 socket 前设置标志，防止 onclose 回调干扰新连接
        if (this.socket) {
            this.stopHeartbeat();
            this._isClosingOldSocket = true;
            this.socket.close();
        }
        
        this.roomId = roomId;
        this.pendingRoomAction = 'join';
        
        // Verify room exists via REST API first
        fetch(`/api/room/lookup?name=${encodeURIComponent(roomId)}`)
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Room not found');
            })
            .then(data => {
                // Room exists, connect to it
                this.connectionState = 'disconnected';
                this.connectWebSocket(data.id);
                this.showMessage('⏳ Joining room...');
            })
            .catch(error => {
                // If not found by name, try connecting directly with the input as ID
                console.log('Room not found by name, trying as ID:', roomId);
                this.connectionState = 'disconnected';
                this.connectWebSocket(roomId);
                this.showMessage('⏳ Joining room...');
            });
    }

    leaveRoom() {
        console.log('Leaving room');
        
        this.stopHeartbeat();
        this.stopOpponentPolling();
        this.stopMovePolling();
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'leaveRoom',
                roomId: this.roomId
            }));
        }
        
        this.resetGame();
        this.switchToLobbyScreen();
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
        this.opponentName = 'Waiting...';
        this.lastKnownUpdate = 0;
        this.pendingMove = null;
        this.moveCount = 0;
        this.isInCheck = false;
        
        const opponentElement = document.getElementById('opponentName');
        if (opponentElement) {
            opponentElement.textContent = this.opponentName;
        }
        
        this.showMessage('');
    }

    // ========================================
    // Polling
    // ========================================
    
    startOpponentPolling() {
        this.stopOpponentPolling();
        
        const poll = () => {
            if (this.opponentName !== 'Waiting...' || !this.roomId) {
                this.stopOpponentPolling();
                return;
            }
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send(JSON.stringify({
                        type: 'checkOpponent',
                        roomId: this.roomId
                    }));
                } catch (error) {
                    console.error('Failed to send polling message:', error);
                    // Optionally trigger reconnection
                }
            }
        };
        
        poll();
        this.opponentPollingInterval = setInterval(poll, 2000);
    }

    stopOpponentPolling() {
        if (this.opponentPollingInterval) {
            clearInterval(this.opponentPollingInterval);
            this.opponentPollingInterval = null;
        }
    }

    startMovePolling() {
        this.stopMovePolling();
        
        const poll = () => {
            if (!this.roomId || this.gameOver) {
                this.stopMovePolling();
                return;
            }
            
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send(JSON.stringify({
                        type: 'checkMoves',
                        roomId: this.roomId,
                        lastKnownUpdate: this.lastKnownUpdate
                    }));
                } catch (error) {
                    console.error('Failed to send polling message:', error);
                    // Optionally trigger reconnection
                }
            }
        };
        
        this.movePollingInterval = setInterval(poll, 3000);
    }

    stopMovePolling() {
        if (this.movePollingInterval) {
            clearInterval(this.movePollingInterval);
            this.movePollingInterval = null;
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
        
        if (this.color === 'red') {
            this.startOpponentPolling();
        }
        
        this.startMovePolling();
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
            indicator.textContent = 'Game Over';
            indicator.className = 'game-status-indicator game-over';
        } else if (this.currentPlayer === this.color) {
            if (this.isInCheck) {
                indicator.textContent = '⚠️ Your Turn (CHECK!)';
                indicator.className = 'game-status-indicator your-turn check';
            } else {
                indicator.textContent = 'Your Turn';
                indicator.className = 'game-status-indicator your-turn';
            }
        } else {
            indicator.textContent = "Opponent's Turn";
            indicator.className = 'game-status-indicator opponent-turn';
        }
    }

    updateConnectionStatus(state) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const states = {
            idle: { text: 'Ready to connect', className: 'status idle' },
            connected: { text: 'Connected', className: 'status connected' },
            connecting: { text: 'Connecting...', className: 'status connecting' },
            disconnected: { text: 'Disconnected', className: 'status disconnected' },
            reconnecting: { text: 'Reconnecting...', className: 'status reconnecting' }
        };
        
        const config = states[state] || states.idle;
        statusElement.textContent = config.text;
        statusElement.className = config.className;
    }

    showMessage(message) {
        const lobbyMessage = document.getElementById('lobbyMessage');
        const gameMessage = document.getElementById('gameMessage');
        
        if (lobbyMessage) {
            lobbyMessage.textContent = message;
        }
        if (gameMessage) {
            gameMessage.textContent = message;
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new ChineseChess();
});
