/**
 * Position State Engine
 * 
 * 核心职责：
 * 1. 定期轮询 Top 500 聪明钱地址的持仓状态
 * 2. 比较新旧状态，识别有意义的仓位变化
 * 3. 生成 TokenFlowEvent 事件
 * 4. 更新 position_states 表，写入 token_flow_events 表
 */

import { db } from '../db/index.js';

// ===== Types =====

interface PositionState {
  walletId: number;
  address: string;
  symbol: string;
  side: 'long' | 'short' | 'flat';
  size: number;      // 合约数量
  notionalUsd: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnl: number;
}

interface HLPosition {
  coin: string;
  szi: string;        // signed size: positive = long, negative = short
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  leverage: {
    type: string;
    value: number;
  };
}

interface HLClearinghouseState {
  assetPositions: Array<{
    position: HLPosition;
  }>;
}

type ActionType = 
  | 'open_long' | 'add_long' | 'reduce_long' | 'close_long'
  | 'open_short' | 'add_short' | 'reduce_short' | 'close_short'
  | 'flip_long_to_short' | 'flip_short_to_long';

interface TokenFlowEvent {
  symbol: string;
  walletId: number;
  address: string;
  action: ActionType;
  sizeChange: number;
  sizeChangeUsd: number;
  newSize: number;
  newNotionalUsd: number;
  newSide: 'long' | 'short' | 'flat';
  fillPrice: number;
  entryPrice: number;
  leverage: number;
  traderRank: number;
  pnl30d: number;
  winRate30d: number;
}

// ===== Hyperliquid API =====

const HL_API_BASE = 'https://api.hyperliquid.xyz';

async function fetchUserPositions(address: string): Promise<Map<string, PositionState>> {
  const positions = new Map<string, PositionState>();
  
  try {
    const response = await fetch(`${HL_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: address,
      }),
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch positions for ${address}: ${response.status}`);
      return positions;
    }
    
    const data: HLClearinghouseState = await response.json();
    
    for (const ap of data.assetPositions || []) {
      const pos = ap.position;
      const size = parseFloat(pos.szi);
      const absSize = Math.abs(size);
      
      if (absSize < 0.0000001) continue; // Skip dust positions
      
      const symbol = pos.coin;
      const side: 'long' | 'short' = size > 0 ? 'long' : 'short';
      const entryPrice = parseFloat(pos.entryPx);
      const notionalUsd = Math.abs(parseFloat(pos.positionValue));
      const unrealizedPnl = parseFloat(pos.unrealizedPnl);
      const leverage = pos.leverage?.value || 1;
      
      positions.set(symbol, {
        walletId: 0, // Will be set later
        address,
        symbol,
        side,
        size: absSize,
        notionalUsd,
        entryPrice,
        leverage,
        unrealizedPnl,
      });
    }
  } catch (error) {
    console.error(`Error fetching positions for ${address}:`, error);
  }
  
  return positions;
}

async function fetchCurrentPrice(symbol: string): Promise<number> {
  try {
    const response = await fetch(`${HL_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    
    if (!response.ok) return 0;
    
    const data: Record<string, string> = await response.json();
    return parseFloat(data[symbol] || '0');
  } catch {
    return 0;
  }
}

// ===== Position State Engine =====

/**
 * 比较新旧仓位状态，判断发生了什么动作
 */
function detectAction(
  oldState: PositionState | null,
  newState: PositionState | null
): ActionType | null {
  const oldSide = oldState?.side || 'flat';
  const newSide = newState?.side || 'flat';
  const oldSize = oldState?.size || 0;
  const newSize = newState?.size || 0;
  
  // flat -> long: 新开多
  if (oldSide === 'flat' && newSide === 'long') {
    return 'open_long';
  }
  
  // flat -> short: 新开空
  if (oldSide === 'flat' && newSide === 'short') {
    return 'open_short';
  }
  
  // long -> flat: 平多
  if (oldSide === 'long' && newSide === 'flat') {
    return 'close_long';
  }
  
  // short -> flat: 平空
  if (oldSide === 'short' && newSide === 'flat') {
    return 'close_short';
  }
  
  // long -> short: 多转空
  if (oldSide === 'long' && newSide === 'short') {
    return 'flip_long_to_short';
  }
  
  // short -> long: 空转多
  if (oldSide === 'short' && newSide === 'long') {
    return 'flip_short_to_long';
  }
  
  // long -> long: 加多或减多
  if (oldSide === 'long' && newSide === 'long') {
    if (newSize > oldSize * 1.01) { // 增加超过 1%
      return 'add_long';
    } else if (newSize < oldSize * 0.99) { // 减少超过 1%
      return 'reduce_long';
    }
  }
  
  // short -> short: 加空或减空
  if (oldSide === 'short' && newSide === 'short') {
    if (newSize > oldSize * 1.01) {
      return 'add_short';
    } else if (newSize < oldSize * 0.99) {
      return 'reduce_short';
    }
  }
  
  return null; // 无有意义的变化
}

/**
 * 从数据库加载钱包的缓存仓位状态
 */
async function loadCachedPositions(walletId: number): Promise<Map<string, PositionState>> {
  const positions = new Map<string, PositionState>();
  
  const result = await db.query(`
    SELECT ps.*, w.address
    FROM position_states ps
    JOIN wallets w ON ps.wallet_id = w.id
    WHERE ps.wallet_id = $1
  `, [walletId]);
  
  for (const row of result.rows) {
    positions.set(row.symbol, {
      walletId: row.wallet_id,
      address: row.address,
      symbol: row.symbol,
      side: row.side as 'long' | 'short' | 'flat',
      size: parseFloat(row.size),
      notionalUsd: parseFloat(row.notional_usd),
      entryPrice: parseFloat(row.entry_price),
      leverage: parseFloat(row.leverage),
      unrealizedPnl: parseFloat(row.unrealized_pnl),
    });
  }
  
  return positions;
}

/**
 * 更新数据库中的仓位状态
 */
async function updateCachedPosition(walletId: number, state: PositionState | null, symbol: string): Promise<void> {
  if (!state || state.side === 'flat') {
    // 删除已平仓位
    await db.query(`
      DELETE FROM position_states WHERE wallet_id = $1 AND symbol = $2
    `, [walletId, symbol]);
  } else {
    // 插入或更新仓位
    await db.query(`
      INSERT INTO position_states (wallet_id, symbol, side, size, notional_usd, entry_price, leverage, unrealized_pnl, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (wallet_id, symbol) DO UPDATE SET
        side = EXCLUDED.side,
        size = EXCLUDED.size,
        notional_usd = EXCLUDED.notional_usd,
        entry_price = EXCLUDED.entry_price,
        leverage = EXCLUDED.leverage,
        unrealized_pnl = EXCLUDED.unrealized_pnl,
        updated_at = NOW()
    `, [walletId, symbol, state.side, state.size, state.notionalUsd, state.entryPrice, state.leverage, state.unrealizedPnl]);
  }
}

/**
 * 写入 TokenFlowEvent 到数据库
 */
async function insertFlowEvent(event: TokenFlowEvent): Promise<void> {
  await db.query(`
    INSERT INTO token_flow_events (
      ts, symbol, wallet_id, address, action,
      size_change, size_change_usd, new_size, new_notional_usd, new_side,
      fill_price, entry_price, leverage,
      trader_rank, pnl_30d, win_rate_30d
    ) VALUES (
      NOW(), $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15
    )
  `, [
    event.symbol, event.walletId, event.address, event.action,
    event.sizeChange, event.sizeChangeUsd, event.newSize, event.newNotionalUsd, event.newSide,
    event.fillPrice, event.entryPrice, event.leverage,
    event.traderRank, event.pnl30d, event.winRate30d,
  ]);
}

/**
 * 处理单个钱包的仓位变化
 */
async function processWallet(
  wallet: { id: number; address: string; rank: number; pnl30d: number; winRate30d: number }
): Promise<TokenFlowEvent[]> {
  const events: TokenFlowEvent[] = [];
  
  // 1. 加载缓存的仓位状态
  const cachedPositions = await loadCachedPositions(wallet.id);
  
  // 2. 获取最新仓位
  const currentPositions = await fetchUserPositions(wallet.address);
  
  // 3. 收集所有 symbol
  const allSymbols = new Set<string>();
  cachedPositions.forEach((_, symbol) => allSymbols.add(symbol));
  currentPositions.forEach((_, symbol) => allSymbols.add(symbol));
  
  // 4. 比较每个 symbol 的状态变化
  for (const symbol of allSymbols) {
    const oldState = cachedPositions.get(symbol) || null;
    const newState = currentPositions.get(symbol) || null;
    
    // 设置 walletId
    if (newState) {
      newState.walletId = wallet.id;
    }
    
    const action = detectAction(oldState, newState);
    
    if (action) {
      const oldSize = oldState?.size || 0;
      const newSize = newState?.size || 0;
      const sizeChange = Math.abs(newSize - oldSize);
      
      // 获取当前价格来计算名义价值变化
      const currentPrice = newState?.entryPrice || oldState?.entryPrice || await fetchCurrentPrice(symbol);
      const sizeChangeUsd = sizeChange * currentPrice;
      
      const event: TokenFlowEvent = {
        symbol,
        walletId: wallet.id,
        address: wallet.address,
        action,
        sizeChange,
        sizeChangeUsd,
        newSize,
        newNotionalUsd: newState?.notionalUsd || 0,
        newSide: newState?.side || 'flat',
        fillPrice: currentPrice,
        entryPrice: newState?.entryPrice || 0,
        leverage: newState?.leverage || 1,
        traderRank: wallet.rank,
        pnl30d: wallet.pnl30d,
        winRate30d: wallet.winRate30d,
      };
      
      events.push(event);
      
      // 写入数据库
      await insertFlowEvent(event);
      
      console.log(`📊 [${wallet.address.slice(0, 8)}...] ${action} ${symbol}: ${sizeChangeUsd.toFixed(0)} USD`);
    }
    
    // 更新缓存
    await updateCachedPosition(wallet.id, newState, symbol);
  }
  
  return events;
}

/**
 * 获取 Top N 聪明钱钱包
 */
async function getTopWallets(topN: number = 500): Promise<Array<{ id: number; address: string; rank: number; pnl30d: number; winRate30d: number }>> {
  const result = await db.query(`
    SELECT 
      w.id,
      w.address,
      ROW_NUMBER() OVER (ORDER BY m.pnl_30d DESC NULLS LAST) as rank,
      COALESCE(m.pnl_30d, 0)::float as pnl_30d,
      COALESCE(m.win_rate_30d, 0)::float as win_rate_30d
    FROM wallets w
    JOIN wallet_metrics m ON w.id = m.wallet_id
    WHERE w.is_active = true AND w.platform_id = 'hyperliquid'
    ORDER BY m.pnl_30d DESC NULLS LAST
    LIMIT $1
  `, [topN]);
  
  return result.rows.map(row => ({
    id: row.id,
    address: row.address,
    rank: parseInt(row.rank),
    pnl30d: row.pnl_30d,
    winRate30d: row.win_rate_30d,
  }));
}

/**
 * 运行一次仓位状态扫描
 */
export async function runPositionScan(topN: number = 500): Promise<TokenFlowEvent[]> {
  console.log(`\n🔄 Starting position scan for Top ${topN} wallets...`);
  const startTime = Date.now();
  
  const wallets = await getTopWallets(topN);
  console.log(`📋 Found ${wallets.length} wallets to scan`);
  
  const allEvents: TokenFlowEvent[] = [];
  
  // 分批处理，每批 10 个，避免 API 限制
  const batchSize = 10;
  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, i + batchSize);
    
    // 并行处理这一批
    const batchResults = await Promise.all(
      batch.map(wallet => processWallet(wallet).catch(err => {
        console.error(`Error processing wallet ${wallet.address}:`, err);
        return [];
      }))
    );
    
    for (const events of batchResults) {
      allEvents.push(...events);
    }
    
    // 批次间休息，避免 API 限制
    if (i + batchSize < wallets.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 进度日志
    const progress = Math.min(100, Math.round((i + batchSize) / wallets.length * 100));
    process.stdout.write(`\r📊 Progress: ${progress}% (${Math.min(i + batchSize, wallets.length)}/${wallets.length})`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Position scan completed in ${duration}s, found ${allEvents.length} events`);
  
  return allEvents;
}

/**
 * 启动 Position State Engine（持续运行）
 */
export async function startPositionEngine(intervalMs: number = 30000, topN: number = 500): Promise<void> {
  console.log(`\n🚀 Starting Position State Engine`);
  console.log(`   Interval: ${intervalMs / 1000}s`);
  console.log(`   Top N: ${topN}`);
  
  // 首次运行
  await runPositionScan(topN);
  
  // 定时运行
  setInterval(async () => {
    try {
      await runPositionScan(topN);
    } catch (error) {
      console.error('Error in position scan:', error);
    }
  }, intervalMs);
}

