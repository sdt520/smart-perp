-- 扩充 Binance 地址库
-- 来源: Etherscan Labels, Arkham Intelligence, Dune Analytics

-- 使用临时表去重后插入
CREATE TEMP TABLE temp_binance_addresses (
    address VARCHAR(100),
    network_id VARCHAR(50),
    label VARCHAR(200),
    address_type VARCHAR(50),
    is_verified BOOLEAN,
    source VARCHAR(100)
);

-- ==================== Ethereum ====================
INSERT INTO temp_binance_addresses VALUES
    ('0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', 'eth', 'Binance 1', 'hot_wallet', true, 'etherscan'),
    ('0xd551234ae421e3bcba99a0da6d736074f22192ff', 'eth', 'Binance 2', 'hot_wallet', true, 'etherscan'),
    ('0x564286362092d8e7936f0549571a803b203aaced', 'eth', 'Binance 3', 'hot_wallet', true, 'etherscan'),
    ('0x0681d8db095565fe8a346fa0277bffde9c0edbbf', 'eth', 'Binance 4', 'hot_wallet', true, 'etherscan'),
    ('0xfe9e8709d3215310075d67e3ed32a380ccf451c8', 'eth', 'Binance 5', 'hot_wallet', true, 'etherscan'),
    ('0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', 'eth', 'Binance 6', 'hot_wallet', true, 'etherscan'),
    ('0x708396f17127c42383e3b9014072679b2f60b82f', 'eth', 'Binance 7', 'hot_wallet', true, 'etherscan'),
    ('0xe79eef9b9388a4ff70ed7ec5bccd5b928ebb8bd1', 'eth', 'Binance 9', 'hot_wallet', true, 'etherscan'),
    ('0x8f22f2063d253846b53609231ed80fa571bc0c8f', 'eth', 'Binance 10', 'hot_wallet', true, 'etherscan'),
    ('0x85b931a32a0725be14285b66f1a22178c672d69b', 'eth', 'Binance 11', 'hot_wallet', true, 'etherscan'),
    ('0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', 'eth', 'Binance 13', 'hot_wallet', true, 'etherscan'),
    ('0x835678a611b28684005a5e2233695fb6cbbb0007', 'eth', 'Binance 19', 'hot_wallet', true, 'etherscan'),
    ('0xa344c7ada83113b3b56941f6e85bf2eb425949f3', 'eth', 'Binance 20', 'hot_wallet', true, 'etherscan'),
    ('0x5fdb5d8ab72fd8b8f0f62d759f3a0b01fa9dde8b', 'eth', 'Binance 21', 'hot_wallet', true, 'etherscan'),
    ('0x66f049111958809841bbe4b81c034da2d953aa0c', 'eth', 'Binance 22', 'hot_wallet', true, 'etherscan'),
    ('0xd53e73dac6bf2341e7d9ec1a0db97c7dd1c0f31d', 'eth', 'Binance 23', 'hot_wallet', true, 'etherscan'),
    ('0x6cc8dcbca746a6e4fdefb98e1d0df903b107fd21', 'eth', 'Binance 24', 'hot_wallet', true, 'etherscan'),
    ('0x889edf2c811be4a21a12e73e49d81ffff1561234', 'eth', 'Binance 25', 'hot_wallet', true, 'arkham'),
    ('0x3c783c21a0383057d128bae431894a5c19f9cf06', 'eth', 'Binance 26', 'hot_wallet', true, 'arkham'),
    ('0xdccf3b77da55107280bd850ea519df3705d1a75a', 'eth', 'Binance 27', 'hot_wallet', true, 'arkham'),
    ('0xeb2d2f1b8c558a40207669291fda468e50c8a0bb', 'eth', 'Binance 28', 'hot_wallet', true, 'arkham'),
    ('0xf89d7b9c864f589bbf53a82105107622b35eaa40', 'eth', 'Binance Staking', 'hot_wallet', true, 'etherscan'),
    ('0x515b72ed8a97f42c568d6a143232775018f133c8', 'eth', 'Binance Staking 2', 'hot_wallet', true, 'etherscan'),
    ('0x4976a4a02f38326660d17bf34b431dc6e2eb2327', 'eth', 'Binance Deposit', 'deposit', true, 'etherscan'),
    ('0x9696f59e4d72e237be84ffd425dcad154bf96976', 'eth', 'Binance Deposit 2', 'deposit', true, 'etherscan'),
    ('0x61189da79177950a7272c88c6058b96d4bcd6be2', 'eth', 'Binance US', 'hot_wallet', true, 'etherscan'),
    ('0x34ea4138580435b5a521e460035edb19df1938c1', 'eth', 'Binance US 2', 'hot_wallet', true, 'etherscan'),
    ('0xbd612a3f30dca67bf60a39fd0d35e39b7ab55774', 'eth', 'Binance 29', 'hot_wallet', true, 'arkham'),
    ('0x06a0048079ec6571cd1b537418869cde6191d42d', 'eth', 'Binance 30', 'hot_wallet', true, 'arkham'),
    ('0x892e9e24aea3f27f4c6e9360e312cce93cc98ebe', 'eth', 'Binance 31', 'hot_wallet', true, 'arkham'),
    ('0x9a67f1940164d0318612b497e8e6038f902a00a4', 'eth', 'Binance 32', 'hot_wallet', true, 'arkham'),
    ('0xab83d182f3485cf1d6ccdd34c7cfef95b4c08da4', 'eth', 'Binance 33', 'hot_wallet', true, 'arkham');

-- ==================== BSC ====================
INSERT INTO temp_binance_addresses VALUES
    ('0x631fc1ea2270e98fbd9d92658ece0f5a269aa161', 'bsc', 'Binance BSC 3', 'hot_wallet', true, 'bscscan'),
    ('0xa180fe01b906a1be37be6c534a3300785b20d947', 'bsc', 'Binance BSC 5', 'hot_wallet', true, 'bscscan'),
    ('0x29bdfbf7d27462a2d115748ace2bd71a2646946c', 'bsc', 'Binance BSC 11', 'hot_wallet', true, 'arkham'),
    ('0x73f5ebe90f27b46ea12e5795d16c4b408b19cc6f', 'bsc', 'Binance BSC 12', 'hot_wallet', true, 'arkham'),
    ('0x1fbe2acee135d991592f167ac371f3dd893a508b', 'bsc', 'Binance BSC 13', 'hot_wallet', true, 'arkham'),
    ('0xb1256d6b31e4ae87da1d56e5890c66be7f1c038e', 'bsc', 'Binance BSC 14', 'hot_wallet', true, 'arkham'),
    ('0xf68a4b64162906eff0ff6ae34e2bb1cd42fef62d', 'bsc', 'Binance Peg Tokens', 'hot_wallet', true, 'bscscan'),
    ('0x8b99f3660622e21f2910ecca7fbe51d654a1517d', 'bsc', 'Binance Peg Tokens 2', 'hot_wallet', true, 'bscscan'),
    ('0x01681557e9d66a37b37a6c4fefdd95e1845de4d0', 'bsc', 'Binance BSC Cold', 'cold_wallet', true, 'bscscan');

-- ==================== Arbitrum ====================
INSERT INTO temp_binance_addresses VALUES
    ('0x5a52e96bacdabb82fd05763e25335261b270efcb', 'arb', 'Binance ARB 4', 'hot_wallet', true, 'arkham'),
    ('0xdccf3b77da55107280bd850ea519df3705d1a75a', 'arb', 'Binance ARB 5', 'hot_wallet', true, 'arkham'),
    ('0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', 'arb', 'Binance ARB 6', 'hot_wallet', true, 'arkham'),
    ('0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', 'arb', 'Binance ARB 7', 'hot_wallet', true, 'arkham'),
    ('0x28c6c06298d514db089934071355e5743bf21d60', 'arb', 'Binance ARB 8', 'hot_wallet', true, 'arkham'),
    ('0x21a31ee1afc51d94c2efccaa2092ad1028285549', 'arb', 'Binance ARB 9', 'hot_wallet', true, 'arkham'),
    ('0xdfd5293d8e347dfe59e90efd55b2956a1343963d', 'arb', 'Binance ARB 10', 'hot_wallet', true, 'arkham');

-- ==================== Base ====================
INSERT INTO temp_binance_addresses VALUES
    ('0xdccf3b77da55107280bd850ea519df3705d1a75a', 'base', 'Binance Base 3', 'hot_wallet', true, 'arkham'),
    ('0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', 'base', 'Binance Base 4', 'hot_wallet', true, 'arkham'),
    ('0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', 'base', 'Binance Base 5', 'hot_wallet', true, 'arkham'),
    ('0x28c6c06298d514db089934071355e5743bf21d60', 'base', 'Binance Base 6', 'hot_wallet', true, 'arkham'),
    ('0x21a31ee1afc51d94c2efccaa2092ad1028285549', 'base', 'Binance Base 7', 'hot_wallet', true, 'arkham'),
    ('0xdfd5293d8e347dfe59e90efd55b2956a1343963d', 'base', 'Binance Base 8', 'hot_wallet', true, 'arkham');

-- ==================== Solana ====================
INSERT INTO temp_binance_addresses VALUES
    ('5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD', 'sol', 'Binance SOL 13', 'hot_wallet', true, 'solscan'),
    ('GhFWg2sLPJ2d8fz6TqNP27Tt3v3fKNQTEBnBf8qQVqjU', 'sol', 'Binance SOL 14', 'hot_wallet', true, 'solscan'),
    ('H6pJ8tL6csNRkwn3nAfNaXjbReL1bZnWVCGEHR2hLBji', 'sol', 'Binance SOL 15', 'hot_wallet', true, 'arkham'),
    ('2gQPKs8PVsUDhqTtwZZCzBtJmDuHqBx4PD7UrULxGexS', 'sol', 'Binance SOL 16', 'hot_wallet', true, 'arkham'),
    ('FnxaLu1EqGqJ4Tsu3UJp4gPL87rTnSK7vmzQwmXgvTbJ', 'sol', 'Binance SOL 17', 'hot_wallet', true, 'arkham'),
    ('7VHUFJHWu2CuExkJcJrzhQPJ2oygupTWkL2A2For4BmE', 'sol', 'Binance SOL 18', 'hot_wallet', true, 'arkham'),
    ('5sFmwP6TsFJCY2FfDqKpGXvqFyPy5vaGJh7g9L7TvGri', 'sol', 'Binance SOL 19', 'hot_wallet', true, 'arkham'),
    ('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', 'sol', 'Binance SOL 20', 'hot_wallet', true, 'arkham'),
    ('AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSPo9', 'sol', 'Binance SOL 21', 'hot_wallet', true, 'arkham'),
    ('FGihDvz4Jg5Bjk5uyxrpGgwprLdMbhFgWxWLfEBG8J7w', 'sol', 'Binance SOL 22', 'hot_wallet', true, 'arkham');

-- 从临时表插入到正式表（去重）
INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source)
SELECT DISTINCT ON (network_id, LOWER(address)) 
    LOWER(address), network_id, label, address_type, is_verified, source
FROM temp_binance_addresses
ON CONFLICT (network_id, address) DO UPDATE SET
    label = EXCLUDED.label,
    source = EXCLUDED.source;

-- 删除临时表
DROP TABLE temp_binance_addresses;
