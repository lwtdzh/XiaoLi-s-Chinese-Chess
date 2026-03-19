# 更彻底检查（第二轮）：接管式重连 + connected/last\_seen 防注入 + 前端竞态收敛 2026-03-19

## 本轮准则

- 断线重连优先
- 当出现“connected=1 但用户带旧 playerId 重连”时：**踢下线并接管**

## 已完成修改

### 1) REST /join：接管式重连

- 文件：`functions/api/rooms/[id]/join.js`
- 行为：若 `playerId` 属于该房间，则直接 `connected=1,last_seen=now`（不再因 connected=1 直接 409）。

### 2) REST /state：connected/last\_seen 防注入

- 文件：`functions/api/rooms/[id]/state.js`
- 行为：仅当 `playerId` 属于该房间时才更新 `players.connected/last_seen`，避免任意 playerId 污染连接状态。

### 3) REST /move：参数兜底

- 文件：`functions/api/rooms/[id]/move.js`
- 行为：增加坐标为整数的校验，防止 NaN/字符串绕过。

### 4) 前端竞态：恢复/离开/轮询互斥

- 文件：`game.js`
- 新增：
- `_restoringSession`：避免初始化期间多次触发恢复流程
- `_leavingRoom`：离开期间禁止 pollState 继续请求

## 验证

- `npm test`：252/252 通过
- `npm run build`：通过

## 剩余可继续深挖的高风险点（下一轮候选）

1) rooms.status 与 game\_state.status 的完整状态机字典统一（waiting/playing/ended/finished 的关系）；目前 still 允许 rooms=finished, game\_state=ended 的组合。
2) /leave 在断线重连优先语义下：是否应该把 connected 置 0 之前先校验 roomId/name 混用一致性，以及对不存在 room 的幂等返回。
3) /move 的 last\_seen 更新应加 `AND room_id=?`（与 /state 统一）。
4) 前端对 “joinRoom 默认 playerName=黑方玩家” 的逻辑：当加入的是红方空位时名称会不匹配。