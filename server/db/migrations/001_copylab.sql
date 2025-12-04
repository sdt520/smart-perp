-- CopyLab Migration
-- Run this to add CopyLab tables to existing database

-- 17. 跟单策略表
CREATE TABLE IF NOT EXISTS copy_strategies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_address VARCHAR(66) NOT NULL,
    
    total_capital DECIMAL(20, 4) NOT NULL,
    follow_ratio DECIMAL(5, 2) NOT NULL DEFAULT 1,
    
    max_position_ratio DECIMAL(5, 2) DEFAULT 20,
    max_leverage DECIMAL(5, 2) DEFAULT 5,
    stop_loss_percent DECIMAL(5, 2),
    stop_loss_action VARCHAR(20) DEFAULT 'stop',
    
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    mode VARCHAR(20) NOT NULL DEFAULT 'live',
    
    realized_pnl DECIMAL(20, 4) DEFAULT 0,
    unrealized_pnl DECIMAL(20, 4) DEFAULT 0,
    today_pnl DECIMAL(20, 4) DEFAULT 0,
    max_drawdown DECIMAL(5, 2) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    
    target_pnl_30d DECIMAL(20, 4),
    target_max_drawdown DECIMAL(5, 2),
    target_win_rate_30d DECIMAL(5, 2),
    
    started_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. 跟单交易记录表
CREATE TABLE IF NOT EXISTS copy_trades (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER NOT NULL REFERENCES copy_strategies(id) ON DELETE CASCADE,
    
    coin VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    action VARCHAR(20) NOT NULL,
    
    original_size DECIMAL(20, 8) NOT NULL,
    original_notional DECIMAL(20, 4) NOT NULL,
    original_price DECIMAL(20, 8) NOT NULL,
    original_leverage DECIMAL(5, 2),
    
    copy_size DECIMAL(20, 8) NOT NULL,
    copy_notional DECIMAL(20, 4) NOT NULL,
    copy_price DECIMAL(20, 8) NOT NULL,
    copy_leverage DECIMAL(5, 2),
    
    realized_pnl DECIMAL(20, 4) DEFAULT 0,
    fee DECIMAL(20, 8) DEFAULT 0,
    
    was_limited BOOLEAN DEFAULT false,
    limit_reason VARCHAR(100),
    
    target_position_size DECIMAL(20, 8),
    target_position_notional DECIMAL(20, 4),
    copy_position_size DECIMAL(20, 8),
    copy_position_notional DECIMAL(20, 4),
    
    traded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19. 跟单策略持仓表
CREATE TABLE IF NOT EXISTS copy_positions (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER NOT NULL REFERENCES copy_strategies(id) ON DELETE CASCADE,
    coin VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL DEFAULT 'flat',
    
    copy_size DECIMAL(20, 8) DEFAULT 0,
    copy_notional DECIMAL(20, 4) DEFAULT 0,
    copy_entry_price DECIMAL(20, 8) DEFAULT 0,
    
    target_size DECIMAL(20, 8) DEFAULT 0,
    target_notional DECIMAL(20, 4) DEFAULT 0,
    
    unrealized_pnl DECIMAL(20, 4) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(strategy_id, coin)
);

-- 20. 跟单策略每日快照表
CREATE TABLE IF NOT EXISTS copy_strategy_snapshots (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER NOT NULL REFERENCES copy_strategies(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    
    realized_pnl DECIMAL(20, 4) DEFAULT 0,
    unrealized_pnl DECIMAL(20, 4) DEFAULT 0,
    cumulative_pnl DECIMAL(20, 4) DEFAULT 0,
    capital_used DECIMAL(20, 4) DEFAULT 0,
    trades_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(strategy_id, snapshot_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_copy_strategies_user ON copy_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_copy_strategies_status ON copy_strategies(status);
CREATE INDEX IF NOT EXISTS idx_copy_strategies_target ON copy_strategies(target_address);
CREATE INDEX IF NOT EXISTS idx_copy_trades_strategy ON copy_trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_copy_trades_time ON copy_trades(traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_trades_coin ON copy_trades(coin);
CREATE INDEX IF NOT EXISTS idx_copy_positions_strategy ON copy_positions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_copy_strategy_snapshots_strategy ON copy_strategy_snapshots(strategy_id, snapshot_date DESC);

-- 更新触发器
DROP TRIGGER IF EXISTS update_copy_strategies_updated_at ON copy_strategies;
CREATE TRIGGER update_copy_strategies_updated_at BEFORE UPDATE ON copy_strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_copy_positions_updated_at ON copy_positions;
CREATE TRIGGER update_copy_positions_updated_at BEFORE UPDATE ON copy_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 输出成功信息
DO $$
BEGIN
    RAISE NOTICE 'CopyLab tables created successfully!';
END $$;

