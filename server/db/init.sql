-- Smart Perp Radar Database Schema
-- PostgreSQL 16

-- 1. 平台表
CREATE TABLE IF NOT EXISTS platforms (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    api_base_url VARCHAR(255),
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 钱包表
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    address VARCHAR(66) NOT NULL,
    platform_id VARCHAR(50) NOT NULL REFERENCES platforms(id),
    twitter_handle VARCHAR(100),
    label VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_id, address)
);

-- 3. 钱包指标表
CREATE TABLE IF NOT EXISTS wallet_metrics (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    pnl_1d DECIMAL(20, 4) DEFAULT 0,
    pnl_7d DECIMAL(20, 4) DEFAULT 0,
    pnl_30d DECIMAL(20, 4) DEFAULT 0,
    win_rate_7d DECIMAL(5, 2) DEFAULT 0,
    win_rate_30d DECIMAL(5, 2) DEFAULT 0,
    trades_count_7d INTEGER DEFAULT 0,
    trades_count_30d INTEGER DEFAULT 0,
    total_volume_7d DECIMAL(20, 4) DEFAULT 0,
    total_volume_30d DECIMAL(20, 4) DEFAULT 0,
    avg_leverage DECIMAL(5, 2) DEFAULT 0,
    last_trade_at TIMESTAMP WITH TIME ZONE,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_id)
);

-- 4. 交易记录表
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    platform_id VARCHAR(50) NOT NULL REFERENCES platforms(id),
    tx_hash VARCHAR(100) NOT NULL,
    coin VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    size DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    closed_pnl DECIMAL(20, 4) DEFAULT 0,
    fee DECIMAL(20, 8) DEFAULT 0,
    leverage DECIMAL(5, 2) DEFAULT 1,
    is_win BOOLEAN,
    traded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_id, tx_hash)
);

-- 5. 排行榜快照表
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id SERIAL PRIMARY KEY,
    platform_id VARCHAR(50) NOT NULL REFERENCES platforms(id),
    wallet_address VARCHAR(66) NOT NULL,
    rank INTEGER,
    period VARCHAR(20) NOT NULL,
    pnl DECIMAL(20, 4),
    roi DECIMAL(10, 4),
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 同步任务表
CREATE TABLE IF NOT EXISTS sync_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    platform_id VARCHAR(50) REFERENCES platforms(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. 每日 PnL 快照表
CREATE TABLE IF NOT EXISTS daily_pnl_snapshots (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    pnl_1d DECIMAL(20, 4) DEFAULT 0,          -- 当日 PnL（与前一天的差值）
    cumulative_pnl DECIMAL(20, 4) DEFAULT 0,  -- 累计 PnL（30D PnL 快照）
    trades_count INTEGER DEFAULT 0,            -- 当日交易数
    win_rate DECIMAL(5, 2) DEFAULT 0,         -- 当日胜率
    volume DECIMAL(20, 4) DEFAULT 0,          -- 当日交易量
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_id, snapshot_date)
);

-- 8. 币种表
CREATE TABLE IF NOT EXISTS coins (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    trade_count INTEGER DEFAULT 0,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. 钱包-币种指标表
CREATE TABLE IF NOT EXISTS wallet_coin_metrics (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    coin VARCHAR(20) NOT NULL,
    pnl_7d DECIMAL(20, 4) DEFAULT 0,
    pnl_30d DECIMAL(20, 4) DEFAULT 0,
    win_rate_7d DECIMAL(5, 2) DEFAULT 0,
    win_rate_30d DECIMAL(5, 2) DEFAULT 0,
    trades_count_7d INTEGER DEFAULT 0,
    trades_count_30d INTEGER DEFAULT 0,
    total_volume_30d DECIMAL(20, 4) DEFAULT 0,
    last_trade_at TIMESTAMP WITH TIME ZONE,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_id, coin)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wallets_platform ON wallets(platform_id);
CREATE INDEX IF NOT EXISTS idx_wallets_active ON wallets(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_wallet_metrics_pnl_30d ON wallet_metrics(pnl_30d DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_metrics_pnl_7d ON wallet_metrics(pnl_7d DESC);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_time ON trades(wallet_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_platform_time ON trades(platform_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_platform_period ON leaderboard_snapshots(platform_id, period, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_wallet_date ON daily_pnl_snapshots(wallet_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_date ON daily_pnl_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_coin_metrics_wallet ON wallet_coin_metrics(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_coin_metrics_coin ON wallet_coin_metrics(coin);
CREATE INDEX IF NOT EXISTS idx_wallet_coin_metrics_pnl ON wallet_coin_metrics(pnl_30d DESC);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_platforms_updated_at BEFORE UPDATE ON platforms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallet_metrics_updated_at BEFORE UPDATE ON wallet_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 初始化平台数据
INSERT INTO platforms (id, name, api_base_url, is_enabled) VALUES
    ('hyperliquid', 'Hyperliquid', 'https://api.hyperliquid.xyz', true),
    ('lighter', 'Lighter', 'https://api.lighter.xyz', false),
    ('aster', 'Aster', 'https://api.aster.xyz', false)
ON CONFLICT (id) DO NOTHING;

-- 视图：带钱包信息的指标（前端查询用）
CREATE OR REPLACE VIEW v_wallet_leaderboard AS
SELECT 
    w.id,
    w.address,
    w.platform_id,
    p.name AS platform_name,
    w.twitter_handle,
    w.label,
    w.is_active,
    COALESCE(m.pnl_1d, 0) AS pnl_1d,
    COALESCE(m.pnl_7d, 0) AS pnl_7d,
    COALESCE(m.pnl_30d, 0) AS pnl_30d,
    COALESCE(m.win_rate_7d, 0) AS win_rate_7d,
    COALESCE(m.win_rate_30d, 0) AS win_rate_30d,
    COALESCE(m.trades_count_7d, 0) AS trades_count_7d,
    COALESCE(m.trades_count_30d, 0) AS trades_count_30d,
    COALESCE(m.total_volume_7d, 0) AS total_volume_7d,
    COALESCE(m.total_volume_30d, 0) AS total_volume_30d,
    m.last_trade_at,
    m.calculated_at,
    w.created_at
FROM wallets w
JOIN platforms p ON w.platform_id = p.id
LEFT JOIN wallet_metrics m ON w.id = m.wallet_id
WHERE w.is_active = true
ORDER BY m.pnl_30d DESC NULLS LAST;

COMMENT ON TABLE platforms IS '交易平台配置表';
COMMENT ON TABLE wallets IS '聪明钱钱包地址表';
COMMENT ON TABLE wallet_metrics IS '钱包指标快照表（Worker计算）';
COMMENT ON TABLE trades IS '原始交易记录表';
COMMENT ON TABLE leaderboard_snapshots IS '平台排行榜快照表';
COMMENT ON TABLE sync_jobs IS '数据同步任务表';
COMMENT ON TABLE daily_pnl_snapshots IS '每日PnL快照表（用于收益曲线）';
COMMENT ON TABLE coins IS '交易币种表';
COMMENT ON TABLE wallet_coin_metrics IS '钱包-币种指标表（按币种分析）';
COMMENT ON VIEW v_wallet_leaderboard IS '钱包排行榜视图（前端API用）';

