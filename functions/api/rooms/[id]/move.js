// POST /api/rooms/:id/move — 走子

export async function onRequestPost(context) {
  const { env, params } = context;
  const db = env.DB;
  const roomId = params.id;

  try {
    const body = await context.request.json();
    const { playerId, from, to, expectedMoveCount } = body;

    if (!playerId || !from || !to) {
      return Response.json({ error: '参数不完整' }, { status: 400 });
    }

    if (typeof expectedMoveCount !== 'number') {
      return Response.json({ error: '缺少 expectedMoveCount' }, { status: 400 });
    }

    // 参数兜底：from/to 坐标必须为整数
    if (!Number.isInteger(from.row) || !Number.isInteger(from.col) || !Number.isInteger(to.row) || !Number.isInteger(to.col)) {
      return Response.json({ error: '坐标非法' }, { status: 400 });
    }

    // 范围校验：避免越界导致服务端规则函数访问异常
    const inRange = (p) => p.row >= 0 && p.row <= 9 && p.col >= 0 && p.col <= 8;
    if (!inRange(from) || !inRange(to)) {
      return Response.json({ error: '坐标超出范围' }, { status: 400 });
    }

    // 验证玩家身份
    const player = await db.prepare(
      'SELECT id, color, room_id FROM players WHERE id = ? AND room_id = ?'
    ).bind(playerId, roomId).first();

    if (!player) {
      return Response.json({ error: '玩家不在此房间' }, { status: 403 });
    }

    // 获取游戏状态
    const state = await db.prepare(
      'SELECT board, current_turn, move_count, status, winner FROM game_state WHERE room_id = ?'
    ).bind(roomId).first();

    if (!state) {
      return Response.json({ error: '游戏状态不存在' }, { status: 404 });
    }

    if (state.status === 'ended') {
      return Response.json({ error: '游戏已结束' }, { status: 400 });
    }

    if (state.current_turn !== player.color) {
      return Response.json({ error: '不是你的回合' }, { status: 400 });
    }

    const board = JSON.parse(state.board);

    // 验证走法
    if (!validateMove(board, from, to, player.color)) {
      return Response.json({ error: '无效的移动' }, { status: 400 });
    }

    const piece = board[from.row][from.col];
    const captured = board[to.row][to.col];

    const nextTurn = player.color === 'red' ? 'black' : 'red';
    const now = Date.now();
    // 乐观锁：避免并发落子覆盖写
    if ((state.move_count || 0) !== expectedMoveCount) {
      return Response.json(
        {
          error: '状态已更新，请刷新后重试',
          code: 'MOVE_CONFLICT',
          serverMoveCount: state.move_count || 0
        },
        { status: 409 }
      );
    }

    const newMoveCount = (state.move_count || 0) + 1;

    let gameStatus = 'playing';
    let winner = null;

    // 执行走子（生成 nextBoard），并做服务端权威校验：禁止自将
    const nextBoard = applyMove(board, from, to);
    if (isKingInCheck(nextBoard, player.color)) {
      return Response.json({ error: '无效的移动：自将' }, { status: 400 });
    }

    // 检查是否吃了将/帅
    if (captured && (captured === 'k' || captured === 'K')) {
      gameStatus = 'ended';
      winner = player.color;
    } else {
      // 将军/将死判定以落子后的局面为准
      const opponentColor = nextTurn;
      if (isKingInCheck(nextBoard, opponentColor) && isCheckmate(nextBoard, opponentColor)) {
        gameStatus = 'ended';
        winner = player.color;
      }
    }

    // 更新游戏状态（带乐观锁，避免并发覆盖写）
    const updateResult = await db.prepare(`
      UPDATE game_state 
      SET board = ?, current_turn = ?, last_move = ?, move_count = ?, 
          status = ?, winner = ?, updated_at = ?
      WHERE room_id = ? AND move_count = ?
    `).bind(
      JSON.stringify(nextBoard),
      nextTurn,
      JSON.stringify({ from, to, piece, captured }),
      newMoveCount,
      gameStatus,
      winner,
      now,
      roomId,
      expectedMoveCount
    ).run();

    if (!updateResult.meta || updateResult.meta.changes === 0) {
      return Response.json(
        {
          error: '状态已更新，请刷新后重试',
          code: 'MOVE_CONFLICT',
          serverMoveCount: state.move_count || 0
        },
        { status: 409 }
      );
    }

    // 如果游戏结束，更新房间状态
    if (gameStatus === 'ended') {
      await db.prepare(
        'UPDATE rooms SET status = ? WHERE id = ?'
      ).bind('finished', roomId).run();

      // 同步 game_state.status 为 ended（当前代码使用 ended 表示对局结束）
      // 注意：game_state.status 由本接口更新为 ended；rooms.status 继续沿用 finished
    } else {
      // 对局仍在进行，确保房间处于 playing
      await db.prepare(
        'UPDATE rooms SET status = ? WHERE id = ? AND status != ?'
      ).bind('playing', roomId, 'finished').run();
    }

    // 更新玩家最后活跃时间
    await db.prepare(
      'UPDATE players SET last_seen = ? WHERE id = ?'
    ).bind(now, playerId).run();

    return Response.json({
      success: true,
      gameState: {
        board: nextBoard,
        currentTurn: nextTurn,
        lastMove: { from, to, piece, captured },
        moveCount: newMoveCount,
        status: gameStatus,
        winner,
        updatedAt: now
      }
    });
  } catch (error) {
    console.error('[API] Move error:', error);
    return Response.json({ error: '走子失败' }, { status: 500 });
  }
}

function validateMove(board, from, to, playerColor) {
  if (!from || !to) return false;
  if (from.row < 0 || from.row > 9 || from.col < 0 || from.col > 8) return false;
  if (to.row < 0 || to.row > 9 || to.col < 0 || to.col > 8) return false;
  if (from.row === to.row && from.col === to.col) return false;

  const piece = board[from.row][from.col];
  if (!piece || piece === '.') return false;

  // 确认棋子颜色匹配
  const isRedPiece = piece === piece.toUpperCase();
  const isRedPlayer = playerColor === 'red';
  if (isRedPiece !== isRedPlayer) return false;

  // 确认目标位置不是己方棋子
  const target = board[to.row][to.col];
  if (target && target !== '.') {
    const targetIsRed = target === target.toUpperCase();
    if (targetIsRed === isRedPiece) return false;
  }

  // 棋子走法验证
  const pieceType = piece.toUpperCase();
  switch (pieceType) {
    case 'K': return validateKing(board, from, to, isRedPiece);
    case 'A': return validateAdvisor(from, to, isRedPiece);
    case 'B': return validateBishop(board, from, to, isRedPiece);
    case 'N': return validateKnight(board, from, to);
    case 'R': return validateRook(board, from, to);
    case 'C': return validateCannon(board, from, to);
    case 'P': return validatePawn(from, to, isRedPiece);
    default: return false;
  }
}

function validateKing(board, from, to, isRed) {
  const minRow = isRed ? 7 : 0;
  const maxRow = isRed ? 9 : 2;

  // 飞将规则：同列且中间无棋子
  if (from.col === to.col) {
    const target = board[to.row][to.col];
    if (target && target !== '.' && target.toUpperCase() === 'K') {
      let blocked = false;
      const startRow = Math.min(from.row, to.row);
      const endRow = Math.max(from.row, to.row);
      for (let r = startRow + 1; r < endRow; r++) {
        if (board[r][from.col] !== '.') { blocked = true; break; }
      }
      if (!blocked) return true;
    }
  }

  if (to.row < minRow || to.row > maxRow || to.col < 3 || to.col > 5) return false;
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  return (dr + dc) === 1;
}

function validateAdvisor(from, to, isRed) {
  const minRow = isRed ? 7 : 0;
  const maxRow = isRed ? 9 : 2;
  if (to.row < minRow || to.row > maxRow || to.col < 3 || to.col > 5) return false;
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  return dr === 1 && dc === 1;
}

function validateBishop(board, from, to, isRed) {
  // 不能过河
  if (isRed && to.row < 5) return false;
  if (!isRed && to.row > 4) return false;

  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  if (dr !== 2 || dc !== 2) return false;

  // 检查象眼
  const blockRow = (from.row + to.row) / 2;
  const blockCol = (from.col + to.col) / 2;
  return board[blockRow][blockCol] === '.';
}

function validateKnight(board, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  if (!((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) return false;

  // 检查蹩马腿
  let blockRow, blockCol;
  if (absDr === 2) {
    blockRow = from.row + (dr > 0 ? 1 : -1);
    blockCol = from.col;
  } else {
    blockRow = from.row;
    blockCol = from.col + (dc > 0 ? 1 : -1);
  }
  return board[blockRow][blockCol] === '.';
}

function validateRook(board, from, to) {
  if (from.row !== to.row && from.col !== to.col) return false;

  // 检查路径上是否有阻挡
  if (from.row === to.row) {
    const minCol = Math.min(from.col, to.col);
    const maxCol = Math.max(from.col, to.col);
    for (let c = minCol + 1; c < maxCol; c++) {
      if (board[from.row][c] !== '.') return false;
    }
  } else {
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    for (let r = minRow + 1; r < maxRow; r++) {
      if (board[r][from.col] !== '.') return false;
    }
  }
  return true;
}

function validateCannon(board, from, to) {
  if (from.row !== to.row && from.col !== to.col) return false;

  let count = 0;
  if (from.row === to.row) {
    const minCol = Math.min(from.col, to.col);
    const maxCol = Math.max(from.col, to.col);
    for (let c = minCol + 1; c < maxCol; c++) {
      if (board[from.row][c] !== '.') count++;
    }
  } else {
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    for (let r = minRow + 1; r < maxRow; r++) {
      if (board[r][from.col] !== '.') count++;
    }
  }

  const target = board[to.row][to.col];
  if (target === '.') {
    return count === 0; // 不吃子时路径无阻挡
  } else {
    return count === 1; // 吃子时必须翻过一个棋子
  }
}

function validatePawn(from, to, isRed) {
  const dr = to.row - from.row;
  const dc = Math.abs(to.col - from.col);

  // 只能走一步
  if (Math.abs(dr) + dc !== 1) return false;

  if (isRed) {
    // 红方向上走（row 减小）
    const crossedRiver = from.row <= 4;
    if (!crossedRiver) {
      return dr === -1 && dc === 0; // 未过河只能前进
    } else {
      return dr <= 0 && !(dr === 0 && dc === 0); // 过河后可以左右，不能后退
    }
  } else {
    // 黑方向下走（row 增大）
    const crossedRiver = from.row >= 5;
    if (!crossedRiver) {
      return dr === 1 && dc === 0;
    } else {
      return dr >= 0 && !(dr === 0 && dc === 0);
    }
  }
}

function applyMove(board, from, to) {
  const nextBoard = cloneBoard(board);
  nextBoard[to.row][to.col] = nextBoard[from.row][from.col];
  nextBoard[from.row][from.col] = '.';
  return nextBoard;
}

function cloneBoard(board) {
  // board 是 10x9 的字符矩阵，浅拷贝每一行即可
  return board.map(row => row.slice());
}

function isKingInCheck(board, color) {
  const kingChar = color === 'red' ? 'K' : 'k';
  const oppColor = color === 'red' ? 'black' : 'red';

  const king = findPiece(board, kingChar);
  if (!king) return false;

  // 对方棋子攻击检测
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (!piece || piece === '.') continue;
      if (pieceColor(piece) !== oppColor) continue;

      const moves = getRawMovesForPiece(board, row, col, piece);
      if (moves.some(m => m.row === king.row && m.col === king.col)) {
        return true;
      }
    }
  }

  // 飞将：两将同列且中间无子
  const oppKingChar = oppColor === 'red' ? 'K' : 'k';
  const oppKing = findPiece(board, oppKingChar);
  if (oppKing && oppKing.col === king.col) {
    const start = Math.min(king.row, oppKing.row);
    const end = Math.max(king.row, oppKing.row);
    for (let r = start + 1; r < end; r++) {
      if (board[r][king.col] !== '.') return false;
    }
    return true;
  }

  return false;
}

function isCheckmate(board, color) {
  // 约定：调用者通常会在 isKingInCheck 为 true 时才调用
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (!piece || piece === '.') continue;
      if (pieceColor(piece) !== color) continue;

      const legalMoves = getLegalMovesForPiece(board, row, col, piece, color);
      if (legalMoves.length > 0) return false;
    }
  }
  return true;
}

function getLegalMovesForPiece(board, row, col, piece, color) {
  const candidates = getRawMovesForPiece(board, row, col, piece);
  const legal = [];

  for (const move of candidates) {
    const testBoard = cloneBoard(board);
    testBoard[move.row][move.col] = testBoard[row][col];
    testBoard[row][col] = '.';
    if (!isKingInCheck(testBoard, color)) {
      legal.push(move);
    }
  }

  return legal;
}

function getRawMovesForPiece(board, row, col, piece) {
  const type = piece.toUpperCase();
  const isRed = piece === piece.toUpperCase();

  switch (type) {
    case 'K':
      return generateKingMoves(board, row, col, isRed);
    case 'A':
      return generateAdvisorMoves(board, row, col, isRed);
    case 'B':
      return generateBishopMoves(board, row, col, isRed);
    case 'N':
      return generateKnightMoves(board, row, col);
    case 'R':
      return generateRookMoves(board, row, col);
    case 'C':
      return generateCannonMoves(board, row, col);
    case 'P':
      return generatePawnMoves(board, row, col, isRed);
    default:
      return [];
  }
}

function generateKingMoves(board, row, col, isRed) {
  const moves = [];
  const minRow = isRed ? 7 : 0;
  const maxRow = isRed ? 9 : 2;
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const { dr, dc } of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < minRow || nr > maxRow || nc < 3 || nc > 5) continue;

    const target = board[nr][nc];
    if (target === '.') {
      moves.push({ row: nr, col: nc });
    } else if (pieceColor(target) !== (isRed ? 'red' : 'black')) {
      moves.push({ row: nr, col: nc });
    }
  }

  // 注意：飞将不在这里生成，避免与 isKingInCheck 的飞将检测互相依赖
  return moves;
}

function generateAdvisorMoves(board, row, col, isRed) {
  const moves = [];
  const minRow = isRed ? 7 : 0;
  const maxRow = isRed ? 9 : 2;
  const dirs = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 }
  ];

  for (const { dr, dc } of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < minRow || nr > maxRow || nc < 3 || nc > 5) continue;

    const target = board[nr][nc];
    if (target === '.') {
      moves.push({ row: nr, col: nc });
    } else if (pieceColor(target) !== (isRed ? 'red' : 'black')) {
      moves.push({ row: nr, col: nc });
    }
  }

  return moves;
}

function generateBishopMoves(board, row, col, isRed) {
  const moves = [];
  const deltas = [
    { dr: -2, dc: -2, br: -1, bc: -1 },
    { dr: -2, dc: 2, br: -1, bc: 1 },
    { dr: 2, dc: -2, br: 1, bc: -1 },
    { dr: 2, dc: 2, br: 1, bc: 1 }
  ];

  for (const { dr, dc, br, bc } of deltas) {
    const nr = row + dr;
    const nc = col + dc;

    if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
    // 不能过河
    if (isRed && nr < 5) continue;
    if (!isRed && nr > 4) continue;

    const blockRow = row + br;
    const blockCol = col + bc;
    if (board[blockRow][blockCol] !== '.') continue;

    const target = board[nr][nc];
    if (target === '.') {
      moves.push({ row: nr, col: nc });
    } else if (pieceColor(target) !== (isRed ? 'red' : 'black')) {
      moves.push({ row: nr, col: nc });
    }
  }

  return moves;
}

function generateKnightMoves(board, row, col) {
  const moves = [];
  const jumps = [
    { dr: -2, dc: -1, br: -1, bc: 0 },
    { dr: -2, dc: 1, br: -1, bc: 0 },
    { dr: 2, dc: -1, br: 1, bc: 0 },
    { dr: 2, dc: 1, br: 1, bc: 0 },
    { dr: -1, dc: -2, br: 0, bc: -1 },
    { dr: 1, dc: -2, br: 0, bc: -1 },
    { dr: -1, dc: 2, br: 0, bc: 1 },
    { dr: 1, dc: 2, br: 0, bc: 1 }
  ];

  for (const { dr, dc, br, bc } of jumps) {
    const nr = row + dr;
    const nc = col + dc;
    const blockRow = row + br;
    const blockCol = col + bc;

    if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
    if (board[blockRow][blockCol] !== '.') continue;

    const target = board[nr][nc];
    if (target === '.') {
      moves.push({ row: nr, col: nc });
    } else if (pieceColor(target) !== pieceColor(board[row][col])) {
      moves.push({ row: nr, col: nc });
    }
  }

  return moves;
}

function generateRookMoves(board, row, col) {
  const moves = [];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const { dr, dc } of dirs) {
    let nr = row + dr;
    let nc = col + dc;

    while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
      const target = board[nr][nc];
      if (target === '.') {
        moves.push({ row: nr, col: nc });
      } else {
        if (pieceColor(target) !== pieceColor(board[row][col])) {
          moves.push({ row: nr, col: nc });
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return moves;
}

function generateCannonMoves(board, row, col) {
  const moves = [];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const { dr, dc } of dirs) {
    let nr = row + dr;
    let nc = col + dc;
    let jumped = false;

    while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
      const target = board[nr][nc];
      if (!jumped) {
        if (target === '.') {
          moves.push({ row: nr, col: nc });
        } else {
          jumped = true;
        }
      } else {
        if (target !== '.') {
          if (pieceColor(target) !== pieceColor(board[row][col])) {
            moves.push({ row: nr, col: nc });
          }
          break;
        }
      }

      nr += dr;
      nc += dc;
    }
  }

  return moves;
}

function generatePawnMoves(board, row, col, isRed) {
  const moves = [];
  const forward = isRed ? -1 : 1;

  // 前进一步
  const nr = row + forward;
  if (nr >= 0 && nr <= 9) {
    const target = board[nr][col];
    if (target === '.' || pieceColor(target) !== (isRed ? 'red' : 'black')) {
      moves.push({ row: nr, col });
    }
  }

  // 过河后可左右
  const crossedRiver = isRed ? row <= 4 : row >= 5;
  if (crossedRiver) {
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (nc < 0 || nc > 8) continue;
      const target = board[row][nc];
      if (target === '.' || pieceColor(target) !== (isRed ? 'red' : 'black')) {
        moves.push({ row, col: nc });
      }
    }
  }

  return moves;
}

function findPiece(board, pieceChar) {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === pieceChar) return { row, col };
    }
  }
  return null;
}

function pieceColor(piece) {
  if (!piece || piece === '.') return null;
  return piece === piece.toUpperCase() ? 'red' : 'black';
}
