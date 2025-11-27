# Worker 离线同步策略

本文档描述了 Smart Perp 项目中 Worker 的数据同步策略、调度间隔和实现细节。

## 概览

Worker 负责从 Hyperliquid API 定期拉取数据，计算交易者指标，并存储到 PostgreSQL 数据库中。

## 同步任务

Worker 采用**链式执行**策略：交易同步完成后自动触发指标计算，避免资源浪费。

### 1. 排行榜同步 (Leaderboard Sync)

| 属性 | 值 |
|------|-----|
| **调度间隔** | 每 12 小时 (`0 0,12 * * *`) |
| **数据来源** | `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard` |
| **同步数量** | Top 1000 个盈利钱包 |
| **预计耗时** | < 30 秒 |

**功能说明：**
- 从 Hyperliquid 官方统计 API 获取完整排行榜数据
- 筛选月度 PnL 为正的钱包，取前 1000 个
- 自动发现新钱包并记录其 displayName（如有）
- 直接从排行榜获取 1D/7D/30D PnL 和交易量数据
- 更新 `wallets` 和 `wallet_metrics` 表

**数据字段：**
- `pnl_1d` - 24小时盈亏
- `pnl_7d` - 7天盈亏
- `pnl_30d` - 30天盈亏
- `total_volume_7d` - 7天交易量
- `total_volume_30d` - 30天交易量

---

### 2. 交易同步 + 指标计算（链式任务）

| 属性 | 值 |
|------|-----|
| **调度间隔** | 每 12 小时 (`30 0,12 * * *`) |
| **预计总耗时** | 35-40 分钟 |

此任务按顺序执行以下三个步骤：

#### 2.1 交易同步 (Trades Sync)
| 属性 | 值 |
|------|-----|
| **数据来源** | `https://api.hyperliquid.xyz/info` (userFillsByTime) |
| **同步数量** | 1000 个钱包 |
| **请求间隔** | 2 秒 / 钱包 |
| **预计耗时** | 约 35 分钟 |

**功能说明：**
- 为每个钱包获取过去 30 天的交易记录（fills）
- 使用 `userFillsByTime` API 接口
- 增量同步：只插入新的交易，已存在的跳过

**交易数据字段：**
- `coin` - 交易币种（如 BTC、ETH）
- `side` - 交易方向（LONG/SHORT）
- `size` - 交易数量
- `price` - 成交价格
- `closed_pnl` - 已实现盈亏
- `fee` - 手续费
- `is_win` - 是否盈利交易（closed_pnl > 0）
- `traded_at` - 交易时间

**限速策略：**
```
正常情况：每个请求间隔 2 秒
连续 3 次错误：等待 30 秒
连续 5 次错误：等待 60 秒
```

#### 2.2 指标计算 (Metrics Calculation)
| 属性 | 值 |
|------|-----|
| **触发时机** | 交易同步完成后自动执行 |
| **数据来源** | 本地 `trades` 表 |
| **预计耗时** | < 1 分钟 |

**功能说明：**
- 基于本地交易数据计算胜率和交易次数
- 更新 `wallet_metrics` 表：
  - `win_rate_7d` - 7天胜率
  - `win_rate_30d` - 30天胜率
  - `trades_count_7d` - 7天交易次数
  - `trades_count_30d` - 30天交易次数

**胜率计算公式：**
```sql
win_rate = (盈利交易数 / 总交易数) × 100%
```

#### 2.3 代币指标计算 (Coin Metrics Calculation)
| 属性 | 值 |
|------|-----|
| **触发时机** | 指标计算完成后自动执行 |
| **数据来源** | 本地 `trades` 表 |
| **预计耗时** | 1-2 分钟 |

**功能说明：**
- 按币种分组计算每个钱包的交易指标
- 更新 `wallet_coin_metrics` 表
- 维护 `coins` 表的币种列表和交易计数

**每币种计算的指标：**
- `pnl_7d` / `pnl_30d` - 该币种盈亏
- `win_rate_7d` / `win_rate_30d` - 该币种胜率
- `trades_count_7d` / `trades_count_30d` - 该币种交易次数
- `total_volume_30d` - 该币种交易量

---

## 调度时间表

```
┌─────────────────────────────────────────────────────────────┐
│                    24 小时调度示意图                          │
├─────────────────────────────────────────────────────────────┤
│ 00:00  排行榜同步（约 30 秒）                                 │
│ 00:30  交易同步 → 指标计算 → 代币指标（约 35-40 分钟）        │
│ ...                                                         │
│ 12:00  排行榜同步（约 30 秒）                                 │
│ 12:30  交易同步 → 指标计算 → 代币指标（约 35-40 分钟）        │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

**Cron 表达式汇总：**
| 任务 | Cron 表达式 | 说明 |
|------|-------------|------|
| 排行榜同步 | `0 0,12 * * *` | 每 12 小时（00:00, 12:00） |
| 交易同步 + 指标计算 | `30 0,12 * * *` | 每 12 小时（00:30, 12:30）链式执行 |

---

## 启动模式

### 1. 定时模式（默认）
```bash
npm run worker
```
- 启动时自动执行一次完整同步
- 之后按 cron 调度定时执行

### 2. 单次模式
```bash
npm run worker -- --once
```
- 执行一次完整同步后退出
- 适用于手动触发或测试

---

## 环境变量配置

可通过环境变量自定义调度间隔：

```bash
# .env 文件
WORKER_LEADERBOARD_CRON="0 */6 * * *"   # 排行榜同步
WORKER_TRADES_CRON="0 * * * *"           # 交易同步
WORKER_METRICS_CRON="*/30 * * * *"       # 指标计算
```

---

## API 限制说明

### Hyperliquid API 限制
- **Stats API** (`stats-data.hyperliquid.xyz`): 无明确限制，响应快
- **Info API** (`api.hyperliquid.xyz/info`): 有限速，建议间隔 500ms+

### 当前策略
- 交易同步请求间隔：2 秒
- 连续错误自动退避：最长等待 60 秒
- 全量同步 1000 钱包约需 35 分钟

---

## 数据流向图

```
┌──────────────────────────────────────────────────────────────────┐
│                      Hyperliquid APIs                            │
├────────────────────────┬─────────────────────────────────────────┤
│   Stats API            │          Info API                       │
│   /leaderboard         │          userFillsByTime                │
└────────────┬───────────┴────────────────┬────────────────────────┘
             │                            │
             │ 每 12 小时                  │ 每 12 小时
             ▼                            ▼
┌────────────────────────┐    ┌────────────────────────────────────┐
│   排行榜同步            │    │          交易同步                   │
│   - 发现新钱包          │    │   - 获取 30 天交易记录              │
│   - 更新 PnL 数据       │    │   - 增量插入交易数据                │
└────────────┬───────────┘    └───────────────┬────────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐    ┌────────────────────────────────────┐
│     wallets 表          │    │           trades 表                 │
│     wallet_metrics 表   │    │                                    │
│     (PnL, 交易量)       │    └───────────────┬────────────────────┘
└────────────────────────┘                    │
                                              │ 交易同步完成后自动触发
                                              ▼
                              ┌────────────────────────────────────┐
                              │          指标计算                   │
                              │   - 计算胜率                        │
                              │   - 计算交易次数                    │
                              └───────────────┬────────────────────┘
                                              │
                                              │ 指标计算完成后自动触发
                                              ▼
                              ┌────────────────────────────────────┐
                              │        代币指标计算                  │
                              │   - 按币种分组计算                   │
                              │   - 更新 coins 表                   │
                              └───────────────┬────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────┐
                  │                  数据库                         │
                  │  wallet_metrics (胜率、交易次数)                │
                  │  wallet_coin_metrics (按币种指标)              │
                  │  coins (币种列表)                              │
                  └───────────────────────┬────────────────────────┘
                                          │
                                          ▼
                              ┌────────────────────────────────────┐
                              │           前端 API                  │
                              │   /api/wallets                     │
                              │   /api/coins/:coin/wallets         │
                              └────────────────────────────────────┘
```

---

## 监控与日志

Worker 运行时会输出以下日志：

```
╔════════════════════════════════════════════════════╗
║          Smart Perp Worker - Scheduled Mode        ║
╠════════════════════════════════════════════════════╣
║  Leaderboard Sync:  Every 12 hours                 ║
║  Trades Sync:       Every 12 hours                 ║
║    → Metrics Calc:  After trades sync              ║
║    → Coin Metrics:  After metrics calc             ║
╚════════════════════════════════════════════════════╝

🚀 Running initial sync...

==================================================
🏆 Starting Leaderboard Sync Job
==================================================
📊 Found 27605 traders on leaderboard
📈 Processing top 1000 profitable wallets...
📊 Leaderboard sync complete. New: 0, Updated: 1000
✅ Leaderboard sync completed successfully

==================================================
📈 Starting Trades Sync Job
==================================================
📈 Syncing trades for all wallets...
  Processing 1000 wallets...
  Estimated time: ~9 minutes
  📊 Progress: 50/1000 (5%) - 2341 new trades - ETA: 475s
  📊 Progress: 100/1000 (10%) - 4892 new trades - ETA: 450s
  ...
📊 Trade sync complete. Total new trades: 15234 in 542s
✅ Trades sync completed successfully

==================================================
🧮 Starting Metrics Calculation Job
==================================================
🧮 Calculating win rates from trade data...
  Processing 1000 wallets...
📊 Metrics calculation complete
✅ Metrics calculation completed successfully

==================================================
🪙 Starting Per-Coin Metrics Calculation Job
==================================================
🪙 Calculating per-coin metrics...
  Processing 45 wallets with trades...
📊 Per-coin metrics calculation complete
✅ Per-coin metrics calculation completed successfully

✅ Initial sync complete. Worker is now running on schedule.
```

同步任务状态记录在 `sync_jobs` 表中，可查询历史执行情况：

```sql
SELECT job_type, status, started_at, completed_at, error_message
FROM sync_jobs
ORDER BY started_at DESC
LIMIT 20;
```

