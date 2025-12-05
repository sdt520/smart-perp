-- 非 Binance 地址缓存表（避免重复调用 API）
CREATE TABLE IF NOT EXISTS not_binance_addresses (
  id SERIAL PRIMARY KEY,
  network_id VARCHAR(20) NOT NULL,
  address VARCHAR(100) NOT NULL,
  checked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  source VARCHAR(50) DEFAULT 'moralis', -- moralis, arkham, etherscan
  UNIQUE(network_id, address)
);

-- 索引：快速查询
CREATE INDEX IF NOT EXISTS idx_not_binance_network_address 
ON not_binance_addresses(network_id, LOWER(address));

-- 索引：清理过期记录
CREATE INDEX IF NOT EXISTS idx_not_binance_expires 
ON not_binance_addresses(expires_at);

-- 注释
COMMENT ON TABLE not_binance_addresses IS '非 Binance 地址缓存，避免重复调用 API';
COMMENT ON COLUMN not_binance_addresses.expires_at IS '缓存过期时间，默认 7 天后过期';

