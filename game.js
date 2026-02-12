
class ChineseChess {
    constructor() {
        this.board = this.initializeBoard();
        this.currentPlayer = 'red';
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];
        this.gameOver = false;
        this.color = null;
        this.roomId = null;
        this.socket = null;
        this.opponentName = 'Waiting...';
        this.myName = 'You';
        this.keepaliveInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 seconds
        
        this.initUI();
        this.connectWebSocket();
    }

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

    initUI() {
        this.renderBoard();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const createBtn = document.getElementById('createRoomBtn');
        const joinBtn = document.getElementById('joinRoomBtn');
        const leaveBtn = document.getElementById('leaveRoomBtn');
        
        console.log('=== Setting up event listeners ===');
        console.log('Create button:', createBtn);
        console.log('Join button:', joinBtn);
        console.log('Leave button:', leaveBtn);
        
        if (!createBtn) console.error('❌ Create button not found!');
        if (!joinBtn) console.error('❌ Join button not found!');
        if (!leaveBtn) console.error('❌ Leave button not found!');
        
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

    renderBoard() {
        const boardElement = document.getElementById('chessBoard');
        boardElement.innerHTML = '';

        // Draw board lines
        this.drawBoardLines(boardElement);

        // Draw pieces
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                const piece = this.board[row][col];
                if (piece) {
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

        // Palace diagonal lines (top)
        const palaceTop1 = document.createElement('div');
        palaceTop1.className = 'board-line';
        palaceTop1.style.left = '162px';
        palaceTop1.style.top = '22px';
        palaceTop1.style.width = '2px';
        palaceTop1.style.height = '132px';
        palaceTop1.style.transform = 'rotate(45deg)';
        palaceTop1.style.transformOrigin = 'top left';
        boardElement.appendChild(palaceTop1);

        const palaceTop2 = document.createElement('div');
        palaceTop2.className = 'board-line';
        palaceTop2.style.left = '246px';
        palaceTop2.style.top = '22px';
        palaceTop2.style.width = '2px';
        palaceTop2.style.height = '132px';
        palaceTop2.style.transform = 'rotate(-45deg)';
        palaceTop2.style.transformOrigin = 'top right';
        boardElement.appendChild(palaceTop2);

        // Palace diagonal lines (bottom)
        const palaceBottom1 = document.createElement('div');
        palaceBottom1.className = 'board-line';
        palaceBottom1.style.left = '162px';
        palaceBottom1.style.top = '312px';
        palaceBottom1.style.width = '2px';
        palaceBottom1.style.height = '132px';
        palaceBottom1.style.transform = 'rotate(-45deg)';
        palaceBottom1.style.transformOrigin = 'top left';
        boardElement.appendChild(palaceBottom1);

        const palaceBottom2 = document.createElement('div');
        palaceBottom2.className = 'board-line';
        palaceBottom2.style.left = '246px';
        palaceBottom2.style.top = '312px';
        palaceBottom2.style.width = '2px';
        palaceBottom2.style.height = '132px';
        palaceBottom2.style.transform = 'rotate(45deg)';
        palaceBottom2.style.transformOrigin = 'top right';
        boardElement.appendChild(palaceBottom2);
    }

    handlePieceClick(row, col) {
        if (this.gameOver) return;
        if (this.currentPlayer !== this.color) return;

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

        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        this.selectedPiece = null;
        this.selectedPosition = null;
        this.validMoves = [];

        // Check for checkmate
        if (capturedPiece && capturedPiece.type === 'jiang') {
            this.gameOver = true;
            this.showMessage(`${this.currentPlayer === 'red' ? 'Red' : 'Black'} wins!`);
        } else {
            this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        }

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
        }
    }

    getValidMoves(row, col, piece) {
        const moves = [];
        
        switch (piece.type) {
            case 'jiang':
                moves.push(...this.getJiangMoves(row, col, piece.color));
                break;
            case 'shi':
                moves.push(...this.getShiMoves(row, col, piece.color));
                break;
            case 'xiang':
                moves.push(...this.getXiangMoves(row, col, piece.color));
                break;
            case 'ma':
                moves.push(...this.getMaMoves(row, col, piece.color));
                break;
            case 'ju':
                moves.push(...this.getJuMoves(row, col, piece.color));
                break;
            case 'pao':
                moves.push(...this.getPaoMoves(row, col, piece.color));
                break;
            case 'zu':
                moves.push(...this.getZuMoves(row, col, piece.color));
                break;
        }

        return moves.filter(move => this.isValidPosition(move.row, move.col) && 
            (!this.board[move.row][move.col] || this.board[move.row][move.col].color !== piece.color));
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 9;
    }

    getJiangMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        
        const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
        const palaceCols = [3, 4, 5];

        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            if (palaceRows.includes(newRow) && palaceCols.includes(newCol)) {
                moves.push({ row: newRow, col: newCol });
            }
        });

        // Flying general rule - can capture opponent's jiang if no pieces between
        const opponentJiangRow = color === 'red' ? 0 : 9;
        for (let r = 0; r < 10; r++) {
            if (this.board[r][col] && this.board[r][col].type === 'jiang' && this.board[r][col].color !== color) {
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
        
        const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
        const palaceCols = [3, 4, 5];

        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            if (palaceRows.includes(newRow) && palaceCols.includes(newCol)) {
                moves.push({ row: newRow, col: newCol });
            }
        });

        return moves;
    }

    getXiangMoves(row, col, color) {
        const moves = [];
        const directions = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
        const blocks = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

        directions.forEach(([dr, dc], index) => {
            const newRow = row + dr;
            const newCol = col + dc;
            const blockRow = row + blocks[index][0];
            const blockCol = col + blocks[index][1];

            if (this.isValidPosition(newRow, newCol)) {
                // Cannot cross river
                if (color === 'red' && newRow < 5) return;
                if (color === 'black' && newRow > 4) return;
                
                // Check if blocked
                if (!this.board[blockRow][blockCol]) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        });

        return moves;
    }

    getMaMoves(row, col, color) {
        const moves = [];
        const jumps = [
            [-2, -1, -1, 0], [-2, 1, -1, 0],
            [2, -1, 1, 0], [2, 1, 1, 0],
            [-1, -2, 0, -1], [1, -2, 0, -1],
            [-1, 2, 0, 1], [1, 2, 0, 1]
        ];

        jumps.forEach(([dr, dc, blockR, blockC]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            const blockRow = row + blockR;
            const blockCol = col + blockC;

            if (this.isValidPosition(newRow, newCol)) {
                // Check if blocked (ma tui)
                if (!this.board[blockRow][blockCol]) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        });

        return moves;
    }

    getJuMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        directions.forEach(([dr, dc]) => {
            let newRow = row + dr;
            let newCol = col + dc;

            while (this.isValidPosition(newRow, newCol)) {
                if (!this.board[newRow][newCol]) {
                    moves.push({ row: newRow, col: newCol });
                } else {
                    if (this.board[newRow][newCol].color !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    break;
                }
                newRow += dr;
                newCol += dc;
            }
        });

        return moves;
    }

    getPaoMoves(row, col, color) {
        const moves = [];
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        directions.forEach(([dr, dc]) => {
            let newRow = row + dr;
            let newCol = col + dc;
            let jumped = false;

            while (this.isValidPosition(newRow, newCol)) {
                if (!this.board[newRow][newCol]) {
                    if (!jumped) {
                        moves.push({ row: newRow, col: newCol });
                    }
                } else {
                    if (!jumped) {
                        jumped = true;
                    } else {
                        if (this.board[newRow][newCol].color !== color) {
                            moves.push({ row: newRow, col: newCol });
                        }
                        break;
                    }
                }
                newRow += dr;
                newCol += dc;
            }
        });

        return moves;
    }

    getZuMoves(row, col, color) {
        const moves = [];
        
        if (color === 'red') {
            // Red zu moves up
            if (row > 0) {
                moves.push({ row: row - 1, col: col });
            }
            // After crossing river, can move left/right
            if (row <= 4) {
                if (col > 0) moves.push({ row: row, col: col - 1 });
                if (col < 8) moves.push({ row: row, col: col + 1 });
            }
        } else {
            // Black zu moves down
            if (row < 9) {
                moves.push({ row: row + 1, col: col });
            }
            // After crossing river, can move left/right
            if (row >= 5) {
                if (col > 0) moves.push({ row: row, col: col - 1 });
                if (col < 8) moves.push({ row: row, col: col + 1 });
            }
        }

        return moves;
    }

    updateTurnIndicator() {
        const indicator = document.getElementById('turnIndicator');
        if (this.gameOver) {
            indicator.textContent = 'Game Over';
        } else if (this.currentPlayer === this.color) {
            indicator.textContent = 'Your Turn';
        } else {
            indicator.textContent = 'Opponent\'s Turn';
        }
    }

    showMessage(message) {
        const lobbyMessageElement = document.getElementById('lobbyMessage');
        const gameMessageElement = document.getElementById('gameMessage');
        
        if (lobbyMessageElement) {
            lobbyMessageElement.textContent = message;
        }
        if (gameMessageElement) {
            gameMessageElement.textContent = message;
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                this.updateConnectionStatus(true);
                this.reconnectAttempts = 0; // Reset reconnect attempts
                this.startKeepalive();
                
                // If we were in a room, rejoin it
                if (this.roomId) {
                    this.socket.send(JSON.stringify({
                        type: 'rejoin',
                        roomId: this.roomId,
                        color: this.color
                    }));
                }
            };
            
            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            };
            
            this.socket.onclose = () => {
                this.stopKeepalive();
                this.updateConnectionStatus(false);
                this.showMessage('Disconnected from server');
                
                // Attempt to reconnect
                this.attemptReconnect();
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        }
    }

    startKeepalive() {
        // Send ping every 30 seconds to keep connection alive
        this.keepaliveInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    stopKeepalive() {
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            this.showMessage(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            this.showMessage('Connection lost. Please refresh the page.');
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'roomCreated':
                this.roomId = data.roomId;
                this.color = data.color;
                this.showMessage(`Room created! ID: ${data.roomId}`);
                this.switchToGameScreen();
                break;
            case 'roomJoined':
                this.roomId = data.roomId;
                this.color = data.color;
                this.opponentName = data.opponentName || 'Opponent';
                document.getElementById('opponentName').textContent = this.opponentName;
                this.showMessage('Joined room!');
                this.switchToGameScreen();
                break;
            case 'playerJoined':
                this.opponentName = data.playerName || 'Opponent';
                document.getElementById('opponentName').textContent = this.opponentName;
                this.showMessage(`${this.opponentName} joined!`);
                break;
            case 'move':
                this.applyOpponentMove(data.from, data.to);
                break;
            case 'playerLeft':
                this.showMessage('Opponent left the game');
                this.gameOver = true;
                break;
            case 'error':
                this.showMessage(data.message);
                break;
            case 'pong':
                // Server responded to ping, connection is alive
                console.log('Keepalive: Connection alive');
                break;
        }
    }

    applyOpponentMove(from, to) {
        const piece = this.board[from.row][from.col];
        this.board[to.row][to.col] = piece;
        this.board[from.row][from.col] = null;
        
        if (this.board[to.row][to.col] && this.board[to.row][to.col].type === 'jiang') {
            this.gameOver = true;
            this.showMessage(`Game Over! ${this.currentPlayer === 'red' ? 'Black' : 'Red'} wins!`);
        }
        
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        this.renderBoard();
        this.updateTurnIndicator();
    }

    createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        console.log('=== Create Room Debug ===');
        console.log('Room name:', roomName);
        
        if (!roomName) {
            console.error('❌ Room name is empty');
            this.showMessage('❌ Please enter a room name');
            return;
        }
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                type: 'createRoom',
                roomName: roomName
            });
            console.log('✅ Sending message:', message);
            this.showMessage('⏳ Creating room: ' + roomName + '...');
            this.socket.send(message);
        } else {
            console.error('❌ WebSocket not connected');
            const status = this.socket ? `State: ${this.socket.readyState}` : 'Not initialized';
            this.showMessage('❌ Not connected! Please wait for green "Connected" status. (' + status + ')');
        }
    }

    joinRoom() {
        const roomId = document.getElementById('joinRoomId').value.trim();
        console.log('=== Join Room Debug ===');
        console.log('Room ID entered:', roomId);
        console.log('Room ID length:', roomId.length);
        
        if (!roomId) {
            console.error('❌ Room ID is empty');
            this.showMessage('❌ Please enter a room ID');
            return;
        }
        
        console.log('WebSocket exists:', !!this.socket);
        console.log('WebSocket state:', this.socket?.readyState);
        console.log('WebSocket OPEN constant:', WebSocket.OPEN);
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                type: 'joinRoom',
                roomId: roomId
            });
            console.log('✅ Sending message:', message);
            this.showMessage('⏳ Joining room: ' + roomId + '...');
            this.socket.send(message);
            console.log('✅ Message sent successfully');
        } else {
            console.error('❌ WebSocket not connected');
            console.error('Socket:', this.socket);
            console.error('State:', this.socket?.readyState);
            const status = this.socket ? `State: ${this.socket.readyState}` : 'Not initialized';
            this.showMessage('❌ Not connected! Please wait for green "Connected" status. (' + status + ')');
        }
    }

    leaveRoom() {
        this.stopKeepalive();
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'leaveRoom',
                roomId: this.roomId
            }));
            this.socket.close();
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
        this.opponentName = 'Waiting...';
        document.getElementById('opponentName').textContent = this.opponentName;
        this.showMessage('');
    }

    switchToGameScreen() {
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('game').classList.remove('hidden');
        this.renderBoard();
        this.updateTurnIndicator();
    }

    switchToLobbyScreen() {
        document.getElementById('game').classList.add('hidden');
        document.getElementById('lobby').classList.remove('hidden');
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (connected) {
            statusElement.textContent = 'Connected';
            statusElement.className = 'status connected';
        } else {
            statusElement.textContent = 'Disconnected';
            statusElement.className = 'status disconnected';
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChineseChess();
});
