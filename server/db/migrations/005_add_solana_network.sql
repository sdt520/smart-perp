-- 添加 Solana 网络支持
INSERT INTO blockchain_networks (id, name, chain_id, explorer_url, rpc_url, is_enabled)
VALUES ('sol', 'Solana', NULL, 'https://solscan.io', 'https://api.mainnet-beta.solana.com', true)
ON CONFLICT (id) DO NOTHING;

-- 添加已知的 Binance Solana 地址
-- 来源: Solscan 标签, Arkham
INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source) VALUES
    -- Binance 主要热钱包
    ('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', 'sol', 'Binance Hot Wallet 1', 'hot_wallet', true, 'solscan'),
    ('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'sol', 'Binance Hot Wallet 2', 'hot_wallet', true, 'solscan'),
    ('2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S', 'sol', 'Binance Hot Wallet 3', 'hot_wallet', true, 'solscan'),
    ('AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', 'sol', 'Binance Hot Wallet 4', 'hot_wallet', true, 'solscan'),
    ('3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E', 'sol', 'Binance Hot Wallet 5', 'hot_wallet', true, 'solscan'),
    ('6ZRCB7AAqGre6c72PRz3MHLC73VMYvJ8bi9KHf1HFpNk', 'sol', 'Binance Hot Wallet 6', 'hot_wallet', true, 'solscan'),
    ('3LZqjCsdpH5N8cLjofvEqH4tVXM5UmGFWmMkmSJ4b3zV', 'sol', 'Binance Hot Wallet 7', 'hot_wallet', true, 'solscan'),
    ('HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', 'sol', 'Binance Hot Wallet 8', 'hot_wallet', true, 'solscan'),
    ('BVd56rwuqxajKa9ZKpKPCDGLZ7VLj6F7G6JMhX2i5L4', 'sol', 'Binance Hot Wallet 9', 'hot_wallet', true, 'arkham'),
    ('BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV', 'sol', 'Binance Hot Wallet 10', 'hot_wallet', true, 'arkham'),
    ('HUyaXbRXPxzPqd9JHJwdMrFq6T5ANnb3HPGbK5SBGkNM', 'sol', 'Binance Cold Wallet 1', 'cold_wallet', true, 'arkham'),
    ('EvoKQpSa2trgCn3DYqdHZkSPTLXBEJU7oLXp4VqvZpFh', 'sol', 'Binance Cold Wallet 2', 'cold_wallet', true, 'arkham')
ON CONFLICT (network_id, address) DO NOTHING;

