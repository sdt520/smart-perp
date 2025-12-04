-- Binance Dump Radar 功能
-- 监控大额代币充值到币安

-- 1. 支持的区块链网络表
CREATE TABLE IF NOT EXISTS blockchain_networks (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    chain_id INTEGER,
    rpc_url TEXT,
    explorer_url TEXT,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 初始化网络数据
INSERT INTO blockchain_networks (id, name, chain_id, explorer_url, is_enabled) VALUES
    ('eth', 'Ethereum', 1, 'https://etherscan.io', true),
    ('bsc', 'BNB Chain', 56, 'https://bscscan.com', true),
    ('arb', 'Arbitrum', 42161, 'https://arbiscan.io', true),
    ('base', 'Base', 8453, 'https://basescan.org', true),
    ('sol', 'Solana', NULL, 'https://solscan.io', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Binance 地址库
CREATE TABLE IF NOT EXISTS binance_addresses (
    id SERIAL PRIMARY KEY,
    address VARCHAR(66) NOT NULL,
    network_id VARCHAR(20) NOT NULL REFERENCES blockchain_networks(id),
    label VARCHAR(100),                    -- 如 'Binance Hot Wallet 14'
    address_type VARCHAR(30) NOT NULL,     -- 'hot_wallet' | 'deposit' | 'cold_wallet'
    is_verified BOOLEAN DEFAULT false,     -- 是否经过验证
    source VARCHAR(50),                    -- 数据来源: 'arkham', 'etherscan', 'manual'
    first_seen_at TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(network_id, address)
);

-- 3. 代币信息表
CREATE TABLE IF NOT EXISTS dump_radar_tokens (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(30) NOT NULL,
    name VARCHAR(100),
    contract_address VARCHAR(66) NOT NULL,
    network_id VARCHAR(20) NOT NULL REFERENCES blockchain_networks(id),
    decimals INTEGER DEFAULT 18,
    logo_url TEXT,
    coingecko_id VARCHAR(100),
    market_cap DECIMAL(30, 2),             -- 市值
    price_usd DECIMAL(30, 10),             -- 当前价格
    price_updated_at TIMESTAMP WITH TIME ZONE,
    is_popular BOOLEAN DEFAULT false,      -- 是否是热门代币（预置）
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(network_id, contract_address)
);

-- 初始化一些热门代币
INSERT INTO dump_radar_tokens (symbol, name, contract_address, network_id, decimals, coingecko_id, is_popular) VALUES
    ('PEPE', 'Pepe', '0x6982508145454Ce325dDbE47a25d4ec3d2311933', 'eth', 18, 'pepe', true),
    ('SHIB', 'Shiba Inu', '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', 'eth', 18, 'shiba-inu', true),
    ('FLOKI', 'Floki', '0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E', 'eth', 9, 'floki', true),
    ('WIF', 'dogwifhat', '0xb6a7edc0f5db9a0a04e31edc4ead1b7824d43cb2', 'eth', 6, 'dogwifcoin', true),
    ('BONK', 'Bonk', '0x1151CB3d861920e07a38e03eEAd12C32178567F6', 'eth', 5, 'bonk', true),
    ('ARB', 'Arbitrum', '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1', 'eth', 18, 'arbitrum', true),
    ('OP', 'Optimism', '0x4200000000000000000000000000000000000042', 'eth', 18, 'optimism', true),
    ('LINK', 'Chainlink', '0x514910771AF9Ca656af840dff83E8264EcF986CA', 'eth', 18, 'chainlink', true),
    ('UNI', 'Uniswap', '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'eth', 18, 'uniswap', true),
    ('AAVE', 'Aave', '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', 'eth', 18, 'aave', true)
ON CONFLICT (network_id, contract_address) DO NOTHING;

-- 4. 用户监控代币表
CREATE TABLE IF NOT EXISTS user_dump_radar_watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id INTEGER NOT NULL REFERENCES dump_radar_tokens(id) ON DELETE CASCADE,
    threshold_usd DECIMAL(20, 2) DEFAULT 1000000,   -- 阈值，默认100万美金
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token_id)
);

-- 5. 大额充值事件表
CREATE TABLE IF NOT EXISTS dump_radar_events (
    id BIGSERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES dump_radar_tokens(id) ON DELETE CASCADE,
    network_id VARCHAR(20) NOT NULL REFERENCES blockchain_networks(id),
    tx_hash VARCHAR(100) NOT NULL,
    block_number BIGINT,
    
    -- 转账信息
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66) NOT NULL,
    to_binance_label VARCHAR(100),         -- Binance 地址标签
    
    -- 金额
    amount DECIMAL(38, 0) NOT NULL,        -- 原始数量（无精度）
    amount_formatted DECIMAL(30, 8),       -- 格式化后数量
    amount_usd DECIMAL(20, 2),             -- USD 价值
    price_at_time DECIMAL(30, 10),         -- 转账时价格
    
    -- 发送者信息
    from_label VARCHAR(100),               -- 如果已知（项目方/基金/鲸鱼）
    from_tag VARCHAR(50),                  -- 'project_team' | 'fund' | 'whale' | 'unknown'
    
    -- 时间
    tx_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(network_id, tx_hash)
);

-- 6. 用户 Dump Radar 通知设置
CREATE TABLE IF NOT EXISTS user_dump_radar_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    notifications_enabled BOOLEAN DEFAULT true,    -- 全局开关
    default_threshold_usd DECIMAL(20, 2) DEFAULT 1000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. 代币24h统计表（用于净流入计算）
CREATE TABLE IF NOT EXISTS dump_radar_token_stats (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES dump_radar_tokens(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    
    -- 流入统计
    inflow_count INTEGER DEFAULT 0,        -- 充值次数
    inflow_amount DECIMAL(30, 8) DEFAULT 0,-- 充值总量
    inflow_usd DECIMAL(20, 2) DEFAULT 0,   -- 充值 USD
    
    -- 流出统计（可选，v2）
    outflow_count INTEGER DEFAULT 0,
    outflow_amount DECIMAL(30, 8) DEFAULT 0,
    outflow_usd DECIMAL(20, 2) DEFAULT 0,
    
    -- 净流入
    net_inflow_usd DECIMAL(20, 2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(token_id, stat_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_binance_addresses_network ON binance_addresses(network_id);
CREATE INDEX IF NOT EXISTS idx_binance_addresses_address ON binance_addresses(address);
CREATE INDEX IF NOT EXISTS idx_binance_addresses_type ON binance_addresses(address_type);

CREATE INDEX IF NOT EXISTS idx_dump_radar_tokens_network ON dump_radar_tokens(network_id);
CREATE INDEX IF NOT EXISTS idx_dump_radar_tokens_symbol ON dump_radar_tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_dump_radar_tokens_popular ON dump_radar_tokens(is_popular) WHERE is_popular = true;

CREATE INDEX IF NOT EXISTS idx_user_dump_radar_watchlist_user ON user_dump_radar_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dump_radar_watchlist_token ON user_dump_radar_watchlist(token_id);

CREATE INDEX IF NOT EXISTS idx_dump_radar_events_token ON dump_radar_events(token_id, tx_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dump_radar_events_network ON dump_radar_events(network_id, tx_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dump_radar_events_timestamp ON dump_radar_events(tx_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dump_radar_events_from ON dump_radar_events(from_address);
CREATE INDEX IF NOT EXISTS idx_dump_radar_events_amount_usd ON dump_radar_events(amount_usd DESC);

CREATE INDEX IF NOT EXISTS idx_dump_radar_token_stats_token_date ON dump_radar_token_stats(token_id, stat_date DESC);

-- 触发器
CREATE TRIGGER update_binance_addresses_updated_at BEFORE UPDATE ON binance_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dump_radar_tokens_updated_at BEFORE UPDATE ON dump_radar_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_dump_radar_watchlist_updated_at BEFORE UPDATE ON user_dump_radar_watchlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_dump_radar_settings_updated_at BEFORE UPDATE ON user_dump_radar_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dump_radar_token_stats_updated_at BEFORE UPDATE ON dump_radar_token_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 注释
COMMENT ON TABLE blockchain_networks IS '支持的区块链网络';
COMMENT ON TABLE binance_addresses IS 'Binance 地址库（热钱包/充值地址）';
COMMENT ON TABLE dump_radar_tokens IS '可监控的代币列表';
COMMENT ON TABLE user_dump_radar_watchlist IS '用户监控代币列表';
COMMENT ON TABLE dump_radar_events IS '大额充值事件记录';
COMMENT ON TABLE user_dump_radar_settings IS '用户 Dump Radar 通知设置';
COMMENT ON TABLE dump_radar_token_stats IS '代币每日统计（净流入）';

-- 预置一些已知的 Binance 热钱包地址
INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source) VALUES
    -- Ethereum 主网
    ('0x28C6c06298d514Db089934071355E5743bf21d60', 'eth', 'Binance 14', 'hot_wallet', true, 'etherscan'),
    ('0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', 'eth', 'Binance 15', 'hot_wallet', true, 'etherscan'),
    ('0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', 'eth', 'Binance 16', 'hot_wallet', true, 'etherscan'),
    ('0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', 'eth', 'Binance 17', 'hot_wallet', true, 'etherscan'),
    ('0x9696f59E4d72E237BE84fFD425DCaD154Bf96976', 'eth', 'Binance 18', 'hot_wallet', true, 'etherscan'),
    ('0x4976A4A02f38326660D17bf34b431dC6e2eb2327', 'eth', 'Binance 19', 'hot_wallet', true, 'etherscan'),
    ('0xf977814e90da44bfa03b6295a0616a897441acec', 'eth', 'Binance 8', 'hot_wallet', true, 'etherscan'),
    ('0x5a52e96bacdabb82fd05763e25335261b270efcb', 'eth', 'Binance 9', 'hot_wallet', true, 'etherscan'),
    ('0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', 'eth', 'Binance Cold Wallet', 'cold_wallet', true, 'etherscan'),
    -- BSC
    ('0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', 'bsc', 'Binance Hot Wallet', 'hot_wallet', true, 'bscscan'),
    ('0xe2fc31F816A9b94326492132018C3aEcC4a93aE1', 'bsc', 'Binance Hot Wallet 2', 'hot_wallet', true, 'bscscan'),
    ('0xF977814e90dA44bFA03b6295A0616a897441aceC', 'bsc', 'Binance 8', 'hot_wallet', true, 'bscscan'),
    -- Arbitrum
    ('0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D', 'arb', 'Binance Arbitrum', 'hot_wallet', true, 'arbiscan'),
    ('0xa7a62c667d5e07cfa9c0b6c52b87e6b9e7e02979', 'arb', 'Binance Arbitrum 2', 'hot_wallet', true, 'arbiscan')
ON CONFLICT (network_id, address) DO NOTHING;

