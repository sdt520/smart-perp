import { db } from '../src/db/index.js';

async function check() {
  try {
    // 检查 token_flow_events 表
    const flowEvents = await db.query('SELECT COUNT(*) as count FROM token_flow_events');
    console.log('token_flow_events 记录数:', flowEvents.rows[0].count);
    
    // 检查 BTC 事件按 rank 分布
    const btcRanks = await db.query(
      `SELECT trader_rank, COUNT(*) as count FROM token_flow_events 
       WHERE symbol = 'BTC' 
       GROUP BY trader_rank 
       ORDER BY count DESC LIMIT 10`
    );
    console.log('BTC 事件按 rank 分布:', btcRanks.rows);
    
    // 检查 BTC 且 rank <= 100 的记录数
    const btcRank100 = await db.query(
      `SELECT COUNT(*) as count FROM token_flow_events 
       WHERE symbol = 'BTC' AND trader_rank <= 100`
    );
    console.log('BTC 且 rank<=100 的记录数:', btcRank100.rows[0].count);
    
    // 检查最近 24 小时内 BTC 且 rank <= 100 的记录数
    const btc24h = await db.query(
      `SELECT COUNT(*) as count FROM token_flow_events 
       WHERE symbol = 'BTC' 
         AND trader_rank <= 100 
         AND ts >= NOW() - INTERVAL '24 hours'`
    );
    console.log('BTC 24小时内 rank<=100 的记录数:', btc24h.rows[0].count);
    
    // 检查最近的事件
    const recent = await db.query(
      `SELECT symbol, ts, trader_rank, size_change_usd 
       FROM token_flow_events 
       ORDER BY ts DESC LIMIT 5`
    );
    console.log('最近5条事件:', recent.rows);
    
    // 检查有哪些币种
    const coins = await db.query(
      `SELECT symbol, COUNT(*) as count FROM token_flow_events 
       GROUP BY symbol ORDER BY count DESC LIMIT 10`
    );
    console.log('币种分布:', coins.rows);
    
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

check();

