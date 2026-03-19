# 更彻底检查：断线重连优先语义统一 + REST move 乐观锁 2026-03-19

## 目标

- 统一“断线重连优先”语义：
- `leave` 仅标记玩家断开（`connected=0`），**不清空** `rooms.red_player_id/black_player_id`。
- 房间满员后进入 `playing`，对局进行中掉线/leave **不改变 playing**。
- REST `/api/rooms/:id/move` 引入 **expectedMoveCount** 乐观锁，避免并发写覆盖。
- 前端对冲突做友好处理：提示并触发轮询拉取权威状态；冲突时不回滚到旧盘面。

## 涉及文件

- `functions/api/rooms/[id]/move.js`
- `game.js`
- `functions/api/rooms/[id]/leave.js`
- `functions/api/rooms/[id]/join.js`
- （辅助一致性）`functions/api/rooms.js`

## 已实施要点

1) REST move：

- 请求体新增 `expectedMoveCount:number`
- 读取 state 后先比对，不一致返回 `409 {code:'MOVE_CONFLICT'}`
- 更新 DB 时使用 `WHERE room_id=? AND move_count=?`，并检查 `meta.changes`。

2) 前端：

- 发送 move 时携带 `expectedMoveCount = this.moveCount - 1`
- 409/MOVE\_CONFLICT 时提示并 `pollState()` 同步；catch 中遇到 MOVE\_CONFLICT 不回滚。

3) leave 语义：

- leave 不再清空 rooms 席位与修改 status；仅 `players.connected=0` 并更新 `last_seen`。

## 仍需注意的风险项

- 之前曾引入过“leave 时 rooms/status 回 waiting”的历史改动；当前已按断线重连优先回归。
- 由于本仓库的 WebSocket 服务端实现并未实际存在于 `functions/_middleware.js`（当前仅 DB init + CORS），因此本次“统一”只覆盖 REST + 轮询路径；若后续重新引入 WS handler，需要把相同语义与乐观锁迁移过去。

## 验证建议（需执行）

- `npm test`
- `npm run build`
- `npm run dev:local`：两浏览器窗口加入同一房间，制造并发落子观察 409 处理与自动同步