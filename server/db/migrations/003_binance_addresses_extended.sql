-- 扩展 Binance 地址库
-- 数据来源: Arkham, Etherscan, Dune Analytics

-- 先清理可能的重复，然后插入
-- 使用临时表来处理

-- ============================================
-- Ethereum 主网 Binance 地址
-- ============================================

-- 删除旧数据重新插入（确保数据一致性）
DELETE FROM binance_addresses WHERE source IN ('arkham', 'etherscan', 'bscscan', 'arbiscan', 'basescan');

INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source) VALUES
    -- Ethereum 主要热钱包
    ('0x28c6c06298d514db089934071355e5743bf21d60', 'eth', 'Binance 14', 'hot_wallet', true, 'arkham'),
    ('0x21a31ee1afc51d94c2efccaa2092ad1028285549', 'eth', 'Binance 15', 'hot_wallet', true, 'arkham'),
    ('0xdfd5293d8e347dfe59e90efd55b2956a1343963d', 'eth', 'Binance 16', 'hot_wallet', true, 'arkham'),
    ('0x56eddb7aa87536c09ccc2793473599fd21a8b17f', 'eth', 'Binance 17', 'hot_wallet', true, 'arkham'),
    ('0x9696f59e4d72e237be84ffd425dcad154bf96976', 'eth', 'Binance 18', 'hot_wallet', true, 'arkham'),
    ('0x4976a4a02f38326660d17bf34b431dc6e2eb2327', 'eth', 'Binance 19', 'hot_wallet', true, 'arkham'),
    ('0xf977814e90da44bfa03b6295a0616a897441acec', 'eth', 'Binance 8', 'hot_wallet', true, 'arkham'),
    ('0x5a52e96bacdabb82fd05763e25335261b270efcb', 'eth', 'Binance 9', 'hot_wallet', true, 'arkham'),
    ('0x3c783c21a0383057d128bae431894a5c19f9cf06', 'eth', 'Binance 3', 'hot_wallet', true, 'arkham'),
    ('0xd551234ae421e3bcba99a0da6d736074f22192ff', 'eth', 'Binance 2', 'hot_wallet', true, 'arkham'),
    ('0x564286362092d8e7936f0549571a803b203aaced', 'eth', 'Binance 4', 'hot_wallet', true, 'arkham'),
    ('0x0681d8db095565fe8a346fa0277bffde9c0edbbf', 'eth', 'Binance 5', 'hot_wallet', true, 'arkham'),
    ('0xfe9e8709d3215310075d67e3ed32a380ccf451c8', 'eth', 'Binance 6', 'hot_wallet', true, 'arkham'),
    ('0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', 'eth', 'Binance 7', 'hot_wallet', true, 'arkham'),
    ('0xab83d182f3485cf1d6ccdd34c7cfef95b4c08da4', 'eth', 'Binance 20', 'hot_wallet', true, 'arkham'),
    ('0x85b931a32a0725be14285b66f1a22178c672d69b', 'eth', 'Binance 10', 'hot_wallet', true, 'arkham'),
    ('0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', 'eth', 'Binance 12', 'hot_wallet', true, 'arkham'),
    ('0x8f22f2063d253846b53609231ed80fa571bc0c8f', 'eth', 'Binance 13', 'hot_wallet', true, 'arkham'),
    ('0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', 'eth', 'Binance 1', 'hot_wallet', true, 'arkham'),
    
    -- Ethereum 冷钱包
    ('0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', 'eth', 'Binance Cold Wallet', 'cold_wallet', true, 'arkham'),
    ('0xf17aced3c7a8daa29ebb90db8d1b6efd8c364a18', 'eth', 'Binance Cold Wallet 2', 'cold_wallet', true, 'arkham'),
    ('0xf89d7b9c864f589bbf53a82105107622b35eaa40', 'eth', 'Binance Cold Wallet 3', 'cold_wallet', true, 'arkham'),
    
    -- Binance Peg & 其他
    ('0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', 'eth', 'Binance-Peg Tokens', 'hot_wallet', true, 'arkham'),
    ('0xe79eef9b9388a4ff70ed7ec5bccd5b928ebb8bd1', 'eth', 'Binance Hot', 'hot_wallet', true, 'arkham'),
    ('0x8b99f3660622e21f2910ecca7fbe51d654a1517d', 'eth', 'Binance Institutional', 'hot_wallet', true, 'arkham'),
    ('0x708396f17127c42383e3b9014072679b2f60b82f', 'eth', 'Binance US', 'hot_wallet', true, 'arkham'),
    ('0xc3c8e0a39769e2308869f7461364ca48155d1d9e', 'eth', 'Binance JEX', 'hot_wallet', true, 'arkham'),
    
    -- BSC 地址
    ('0x8894e0a0c962cb723c1976a4421c95949be2d4e3', 'bsc', 'Binance Hot Wallet 1', 'hot_wallet', true, 'arkham'),
    ('0xe2fc31f816a9b94326492132018c3aecc4a93ae1', 'bsc', 'Binance Hot Wallet 2', 'hot_wallet', true, 'arkham'),
    ('0x631fc1ea2270e98fbd9d92658ece0f5a269aa161', 'bsc', 'Binance Hot 3', 'hot_wallet', true, 'arkham'),
    ('0xb1256d6b31e4ae87da1d56e5890c66be7f1c038e', 'bsc', 'Binance Hot 4', 'hot_wallet', true, 'arkham'),
    ('0x17b692ae403a8ff3a3b2ed7676cf194310dde9af', 'bsc', 'Binance Hot 5', 'hot_wallet', true, 'arkham'),
    ('0x8ff804cc2143451f454779a40de386f913dcff20', 'bsc', 'Binance Hot 6', 'hot_wallet', true, 'arkham'),
    ('0xa180fe01b906a1be37be6c534a3300785b20d947', 'bsc', 'Binance Peg Token Custody', 'hot_wallet', true, 'arkham'),
    
    -- Arbitrum 地址
    ('0xb38e8c17e38363af6ebdcb3dae12e0243582891d', 'arb', 'Binance Arbitrum 1', 'hot_wallet', true, 'arkham'),
    ('0xa7a62c667d5e07cfa9c0b6c52b87e6b9e7e02979', 'arb', 'Binance Arbitrum 2', 'hot_wallet', true, 'arkham'),
    
    -- Base 地址
    ('0x9f26d02bbaf067e68f1c03dbf3458a4afe3cd847', 'base', 'Binance Base 1', 'hot_wallet', true, 'arkham')
    
ON CONFLICT (network_id, address) DO UPDATE SET
    label = EXCLUDED.label,
    address_type = EXCLUDED.address_type,
    source = EXCLUDED.source;
