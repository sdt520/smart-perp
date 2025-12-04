-- 用户 Dump Radar 通知代币列表
CREATE TABLE IF NOT EXISTS user_dump_radar_notification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_symbol VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token_symbol)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_dump_radar_notification_tokens_user ON user_dump_radar_notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_dump_radar_notification_tokens_symbol ON user_dump_radar_notification_tokens(token_symbol);

-- 更新 user_dump_radar_settings 表，添加 watch_all_tokens 字段
ALTER TABLE user_dump_radar_settings 
ADD COLUMN IF NOT EXISTS watch_all_tokens BOOLEAN DEFAULT true;

