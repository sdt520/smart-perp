# Smart Perp Radar 🎯

聪明钱雷达 - 追踪永续合约顶级交易者

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (React)                            │
│              http://localhost:5173                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ API 请求
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端 API (Express)                         │
│              http://localhost:3001                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 数据库                           │
│              localhost:5432                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ▲
                           │ 定时写入
┌──────────────────────────┴──────────────────────────────────────┐
│                        Worker 服务                              │
│   - 排行榜同步 (每6小时)                                          │
│   - 交易记录同步 (每1小时)                                        │
│   - 指标计算 (每30分钟)                                          │
└─────────────────────────────────────────────────────────────────┘
```

## 功能特性

### V0 版本
- ✅ 聪明钱列表页面
- ✅ 展示 1D / 7D / 30D PnL
- ✅ 展示 7D / 30D 胜率
- ✅ 展示 7D / 30D 交易数
- ✅ 支持按各列排序（默认按30D PnL降序）
- ✅ Twitter 链接显示
- ✅ 后端 API 服务
- ✅ PostgreSQL 数据库
- ✅ 离线 Worker 数据同步

### 支持平台
- ✅ Hyperliquid
- 🔜 Lighter (即将支持)
- 🔜 Aster (即将支持)

## 快速开始

### 1. 启动数据库

```bash
# 使用 Docker 启动 PostgreSQL
docker-compose up -d

# 查看数据库状态
docker-compose ps
```

### 2. 启动后端服务

```bash
cd server

# 安装依赖
npm install

# 复制环境配置
cp env.example .env

# 启动 API 服务
npm run dev

# （另一个终端）启动 Worker
npm run worker
```

### 3. 启动前端

```bash
# 安装依赖 (在项目根目录)
npm install

# 启动开发服务器
npm run dev
```

### 访问应用

- 前端: http://localhost:5173
- API: http://localhost:3001/api
- 健康检查: http://localhost:3001/api/health

## 项目结构

```
smart-perp/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── hooks/             # 自定义 Hooks
│   ├── services/          # API 服务
│   ├── types/             # TypeScript 类型
│   └── data/              # 模拟数据
├── server/                 # 后端源码
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── worker/        # Worker 任务
│   │   ├── db/            # 数据库连接
│   │   └── types/         # TypeScript 类型
│   └── db/
│       └── init.sql       # 数据库初始化脚本
├── docs/                   # 文档
│   └── DATABASE_DESIGN.md # 数据库设计
└── docker-compose.yml      # Docker 配置
```

## 数据库表

| 表名 | 说明 |
|------|------|
| platforms | 平台配置 |
| wallets | 钱包地址 |
| wallet_metrics | 钱包指标（Worker 计算）|
| trades | 原始交易记录 |
| leaderboard_snapshots | 排行榜快照 |
| sync_jobs | 同步任务日志 |

详细设计见 [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)

## API 端点

### 钱包

```
GET /api/wallets
  ?platform=hyperliquid   # 筛选平台
  &sortBy=pnl_30d         # 排序字段
  &sortDir=desc           # 排序方向
  &limit=50               # 每页数量
  &offset=0               # 偏移量

GET /api/wallets/stats
  ?platform=hyperliquid   # 筛选平台

GET /api/wallets/:id
```

### 平台

```
GET /api/platforms
GET /api/platforms/:id
```

## Worker 任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 排行榜同步 | 每 6 小时 | 从各平台拉取排行榜，发现新钱包 |
| 交易记录同步 | 每 1 小时 | 拉取活跃钱包的最新交易记录 |
| 指标计算 | 每 30 分钟 | 根据交易记录计算各项指标 |

```bash
# 手动运行一次所有任务
npm run worker:once

# 启动定时任务
npm run worker
```

## 环境变量

### 后端 (server/.env)

```bash
DATABASE_URL=postgresql://smartperp:smartperp123@localhost:5432/smartperp
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 前端

```bash
VITE_API_BASE=http://localhost:3001/api
```

## 后续计划

- [ ] 钱包详情页
- [ ] 交易提醒功能
- [ ] 支持 Lighter 平台
- [ ] 支持 Aster 平台
- [ ] 用户自定义钱包跟踪
- [ ] 迁移到云数据库

## License

MIT
