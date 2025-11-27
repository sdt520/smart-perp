# 数据库设计文档

## 表结构概览

### 1. platforms - 平台表
存储支持的交易平台信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(50) | 主键，平台标识 (hyperliquid, lighter, aster) |
| name | VARCHAR(100) | 平台显示名称 |
| api_base_url | VARCHAR(255) | API 基础地址 |
| is_enabled | BOOLEAN | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 2. wallets - 钱包表
存储被跟踪的聪明钱钱包地址

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| address | VARCHAR(66) | 钱包地址 |
| platform_id | VARCHAR(50) | 所属平台，外键 |
| twitter_handle | VARCHAR(100) | Twitter 用户名（可选）|
| label | VARCHAR(100) | 钱包标签/备注名（可选）|
| is_active | BOOLEAN | 是否活跃跟踪 |
| discovered_at | TIMESTAMP | 发现时间（从排行榜获取的时间）|
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**: (platform_id, address) UNIQUE

### 3. wallet_metrics - 钱包指标快照表
存储计算后的钱包指标数据（Worker 定期计算更新）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| wallet_id | INTEGER | 钱包ID，外键 |
| pnl_1d | DECIMAL(20,4) | 1天 PnL |
| pnl_7d | DECIMAL(20,4) | 7天 PnL |
| pnl_30d | DECIMAL(20,4) | 30天 PnL |
| win_rate_7d | DECIMAL(5,2) | 7天胜率 (0-100) |
| win_rate_30d | DECIMAL(5,2) | 30天胜率 (0-100) |
| trades_count_7d | INTEGER | 7天交易次数 |
| trades_count_30d | INTEGER | 30天交易次数 |
| total_volume_7d | DECIMAL(20,4) | 7天交易量 |
| total_volume_30d | DECIMAL(20,4) | 30天交易量 |
| avg_leverage | DECIMAL(5,2) | 平均杠杆 |
| last_trade_at | TIMESTAMP | 最后交易时间 |
| calculated_at | TIMESTAMP | 指标计算时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引**: wallet_id UNIQUE (每个钱包只保留最新指标)
**索引**: pnl_30d DESC (用于默认排序)

### 4. trades - 交易记录表
存储原始交易数据，用于计算指标

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| wallet_id | INTEGER | 钱包ID，外键 |
| platform_id | VARCHAR(50) | 平台ID |
| tx_hash | VARCHAR(100) | 交易哈希 |
| coin | VARCHAR(20) | 交易币种 |
| side | VARCHAR(10) | 方向 (LONG/SHORT) |
| size | DECIMAL(20,8) | 交易数量 |
| price | DECIMAL(20,8) | 成交价格 |
| closed_pnl | DECIMAL(20,4) | 已实现盈亏 |
| fee | DECIMAL(20,8) | 手续费 |
| leverage | DECIMAL(5,2) | 杠杆倍数 |
| is_win | BOOLEAN | 是否盈利（closed_pnl > 0）|
| traded_at | TIMESTAMP | 交易时间 |
| created_at | TIMESTAMP | 创建时间 |

**索引**: (wallet_id, traded_at)
**索引**: (platform_id, tx_hash) UNIQUE

### 5. leaderboard_snapshots - 排行榜快照表
记录从各平台排行榜抓取的数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| platform_id | VARCHAR(50) | 平台ID |
| wallet_address | VARCHAR(66) | 钱包地址 |
| rank | INTEGER | 排名 |
| period | VARCHAR(20) | 周期 (daily, weekly, monthly, all_time) |
| pnl | DECIMAL(20,4) | PnL |
| roi | DECIMAL(10,4) | ROI 百分比 |
| snapshot_at | TIMESTAMP | 快照时间 |
| created_at | TIMESTAMP | 创建时间 |

**索引**: (platform_id, period, snapshot_at)

### 6. sync_jobs - 同步任务表
记录数据同步任务状态

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| job_type | VARCHAR(50) | 任务类型 (leaderboard_sync, trades_sync, metrics_calc) |
| platform_id | VARCHAR(50) | 平台ID（可选）|
| status | VARCHAR(20) | 状态 (pending, running, completed, failed) |
| started_at | TIMESTAMP | 开始时间 |
| completed_at | TIMESTAMP | 完成时间 |
| error_message | TEXT | 错误信息 |
| metadata | JSONB | 额外元数据 |
| created_at | TIMESTAMP | 创建时间 |

## 数据流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        Worker 定时任务                           │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Hyperliquid   │  │     Lighter     │  │      Aster      │
│   排行榜 API    │  │   排行榜 API    │  │   排行榜 API    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │  leaderboard_snapshots  │
                 │    (排行榜快照表)        │
                 └─────────────────────────┘
                              │
                              ▼ 发现新钱包
                 ┌─────────────────────────┐
                 │        wallets          │
                 │       (钱包表)          │
                 └─────────────────────────┘
                              │
                              ▼ 拉取交易记录
                 ┌─────────────────────────┐
                 │         trades          │
                 │      (交易记录表)        │
                 └─────────────────────────┘
                              │
                              ▼ 计算指标
                 ┌─────────────────────────┐
                 │     wallet_metrics      │
                 │      (钱包指标表)        │
                 └─────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │      前端 API 查询       │
                 │   (按 pnl_30d 排序)      │
                 └─────────────────────────┘
```

## Worker 任务调度

| 任务 | 频率 | 说明 |
|------|------|------|
| 排行榜同步 | 每 6 小时 | 从各平台拉取排行榜，发现新钱包 |
| 交易记录同步 | 每 1 小时 | 拉取活跃钱包的最新交易记录 |
| 指标计算 | 每 30 分钟 | 根据交易记录计算各项指标 |
| 数据清理 | 每天 | 清理超过 90 天的交易记录 |

