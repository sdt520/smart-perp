-- 添加常见的 Solana SPL Token（用于 Dump Radar 监控）
-- 这些是 Binance 支持的 Solana 代币

-- SOL (原生代币，使用 wrapped SOL 地址)
INSERT INTO dump_radar_tokens (symbol, name, contract_address, network_id, decimals, coingecko_id, is_popular, is_enabled)
VALUES 
    ('SOL', 'Wrapped SOL', 'So11111111111111111111111111111111111111112', 'sol', 9, 'solana', true, true),
    ('USDT', 'Tether USD', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'sol', 6, 'tether', true, true),
    ('USDC', 'USD Coin', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'sol', 6, 'usd-coin', true, true),
    ('RAY', 'Raydium', '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'sol', 6, 'raydium', true, true),
    ('JTO', 'Jito', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', 'sol', 9, 'jito-governance-token', true, true),
    ('JUP', 'Jupiter', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'sol', 6, 'jupiter-exchange-solana', true, true),
    ('PYTH', 'Pyth Network', 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', 'sol', 6, 'pyth-network', true, true),
    ('BONK', 'Bonk', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'sol', 5, 'bonk', true, true),
    ('WIF', 'dogwifhat', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'sol', 6, 'dogwifcoin', true, true),
    ('RNDR', 'Render Token', 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', 'sol', 8, 'render-token', true, true),
    ('ORCA', 'Orca', 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', 'sol', 6, 'orca', true, true),
    ('MPLX', 'Metaplex', 'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m', 'sol', 6, 'metaplex', true, true),
    ('GMT', 'GMT', '7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx', 'sol', 9, 'stepn', true, true),
    ('FIDA', 'Bonfida', 'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp', 'sol', 6, 'bonfida', true, true),
    ('MNGO', 'Mango', 'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac', 'sol', 6, 'mango-markets', true, true),
    ('SAMO', 'Samoyedcoin', '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sol', 9, 'samoyedcoin', true, true),
    ('STEP', 'Step Finance', 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT', 'sol', 9, 'step-finance', true, true),
    ('SRM', 'Serum', 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt', 'sol', 6, 'serum', true, true),
    ('MSOL', 'Marinade staked SOL', 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', 'sol', 9, 'msol', true, true),
    ('BSOL', 'BlazeStake Staked SOL', 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', 'sol', 9, 'blazestake-staked-sol', true, true),
    ('JITOSOL', 'Jito Staked SOL', 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', 'sol', 9, 'jito-staked-sol', true, true),
    ('TENSOR', 'Tensor', 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6', 'sol', 9, 'tensor', true, true),
    ('W', 'Wormhole', '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', 'sol', 6, 'wormhole', true, true),
    ('POPCAT', 'Popcat', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'sol', 9, 'popcat', true, true),
    ('MEW', 'cat in a dogs world', 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', 'sol', 5, 'cat-in-a-dogs-world', true, true),
    ('BOME', 'BOOK OF MEME', 'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82', 'sol', 6, 'book-of-meme', true, true),
    ('SLERF', 'SLERF', '7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3', 'sol', 9, 'slerf', true, true),
    ('NOS', 'Nosana', 'nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7', 'sol', 6, 'nosana', true, true),
    ('HONEY', 'Hivemapper', 'HNYpuQAkH3A6kv3Cbp9q5RMmxQjt5hPGxZQvBNYG62QT', 'sol', 9, 'hivemapper', true, true),
    ('MOBILE', 'Helium Mobile', 'mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6', 'sol', 6, 'helium-mobile', true, true)
ON CONFLICT (network_id, contract_address) DO UPDATE SET
    symbol = EXCLUDED.symbol,
    name = EXCLUDED.name,
    decimals = EXCLUDED.decimals,
    coingecko_id = EXCLUDED.coingecko_id,
    is_popular = EXCLUDED.is_popular;

-- 添加更多 Solana Binance 热钱包地址（从 Solscan 和 Arkham 收集）
INSERT INTO binance_addresses (address, network_id, label, address_type, is_verified, source) VALUES
    -- 更多热钱包（从交易历史分析得到）
    ('8BzXvpBnDmMmKhJ4JnM3oBWuUQFTRULqNJGt5KZ9MKyL', 'sol', 'Binance Hot Wallet 11', 'hot_wallet', true, 'analysis'),
    ('4hrcYZLAKpxeJ2b7Q3TuKAq6EYmNVmTzrJPZ4fMvQCqN', 'sol', 'Binance Hot Wallet 12', 'hot_wallet', true, 'analysis'),
    ('CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq', 'sol', 'Binance Hot Wallet 13', 'hot_wallet', true, 'analysis'),
    ('E5hqPfZajQ1wpFXQsYZ9m3LGwUK4BLBuqePJuPGREWDZ', 'sol', 'Binance Hot Wallet 14', 'hot_wallet', true, 'analysis'),
    ('Dp2PJxPgcijgTNVYkREG7FZzL27eBVNWPDCGRQfRvnU4', 'sol', 'Binance Hot Wallet 15', 'hot_wallet', true, 'analysis')
ON CONFLICT (network_id, address) DO NOTHING;

