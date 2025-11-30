/**
 * Position State Engine (WebSocket-based)
 * 
 * 核心架构：
 * 1. WebSocket 订阅公共 trades 流（按币种）
 * 2. 本地维护 smartSet（Top 500 地址）
 * 3. 过滤出 Smart Money 的交易
 * 4. 维护仓位状态，检测有意义的变化
 * 5. 生成 TokenFlowEvent 事件
 */

import WebSocket from 'ws';
import { db } from '../db/index.js';
import { EventEmitter } from 'events';
import { sendTradeNotification } from '../services/telegramService.js';

// ===== Types =====

interface WsTrade {
  coin: string;
  side: string;   // 'B' (buy) | 'A' (ask/sell)
  px: string;     // price
  sz: string;     // size
  time: number;   // timestamp ms
  tid: number;    // trade id
  users: [string, string]; // [buyer, seller]
}

interface WsMessage {
  channel: string;
  data: WsTrade[] | Record<string, string>;
}

interface PositionState {
  szi: number;           // 当前净仓位 (+多 -空)
  avgEntryPx: number;    // 平均入场价格
  realizedPnl: number;   // 已实现 PnL
  lastTradeTs: number;   // 最后交易时间
}

interface SmartTraderMeta {
  walletId: number;
  rank: number;
  pnl30d: number;
  winRate30d: number;
}

type ActionType = 
  | 'open_long' | 'add_long' | 'reduce_long' | 'close_long'
  | 'open_short' | 'add_short' | 'reduce_short' | 'close_short'
  | 'flip_long_to_short' | 'flip_short_to_long';

interface TokenFlowEvent {
  symbol: string;
  address: string;
  walletId: number;
  action: ActionType;
  side: 'B' | 'A';
  price: number;
  size: number;
  sizeUsd: number;
  oldPosition: number;      // 变化前仓位数量
  oldPositionUsd: number;   // 变化前仓位价值 USD
  newPosition: number;
  newPositionUsd: number;
  newSide: 'long' | 'short' | 'flat';
  avgEntryPx: number;
  traderRank: number;
  pnl30d: number;
  winRate30d: number;
  timestamp: number;
}

// ===== Constants =====

const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const HL_API_BASE = 'https://api.hyperliquid.xyz';

// 关心的币种列表
const WATCHED_COINS = [
  'BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'XRP', 'SUI', 'PEPE', 
  'WIF', 'BONK', 'ARB', 'OP', 'AVAX', 'LINK', 'MATIC', 'APT',
  'INJ', 'TIA', 'SEI', 'NEAR', 'ATOM', 'FTM', 'AAVE', 'UNI',
  'LDO', 'MKR', 'CRV', 'SNX', 'RUNE', 'BLUR', 'JTO', 'PYTH',
];

// ===== State =====

// Smart Money 地址集合 (address -> metadata)
const smartSet = new Map<string, SmartTraderMeta>();

// 仓位状态 (address:coin -> state)
const positionMap = new Map<string, PositionState>();

// 当前价格 (coin -> price)
const priceMap = new Map<string, number>();

// 事件发射器
export const eventEmitter = new EventEmitter();

// ===== Event Aggregation =====
// 聚合缓冲区：address:symbol:side -> pending event
const aggregationBuffer = new Map<string, TokenFlowEvent>();
// 聚合时间窗口（毫秒）
const AGGREGATION_WINDOW_MS = 2000;
// 聚合定时器
let aggregationTimer: NodeJS.Timeout | null = null;

// ===== Telegram Deduplication =====
// 已发送通知的去重缓存（event key -> timestamp）
const sentNotifications = new Map<string, number>();
// 去重缓存过期时间（5秒）
const DEDUP_EXPIRY_MS = 5000;

function getNotificationKey(event: TokenFlowEvent): string {
  // 使用 address + symbol + timestamp（精确到秒）作为去重 key
  const tsSeconds = Math.floor(event.timestamp / 1000);
  return `${event.address}:${event.symbol}:${tsSeconds}`;
}

function shouldSendNotification(event: TokenFlowEvent): boolean {
  const key = getNotificationKey(event);
  const now = Date.now();
  
  // 清理过期的缓存
  for (const [k, ts] of sentNotifications) {
    if (now - ts > DEDUP_EXPIRY_MS) {
      sentNotifications.delete(k);
    }
  }
  
  // 检查是否已发送过
  if (sentNotifications.has(key)) {
    console.log(`⚠️ Skipping duplicate notification for ${key}`);
    return false;
  }
  
  // 标记为已发送
  sentNotifications.set(key, now);
  return true;
}

// WebSocket 连接
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000;

// ===== Smart Set Management =====

/**
 * 从数据库加载 Top N 聪明钱地址
 */
export async function loadSmartSet(topN: number = 500): Promise<void> {
  console.log(`📋 Loading Top ${topN} smart traders...`);
  
  const result = await db.query(`
    SELECT 
      w.id as wallet_id,
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
  
  smartSet.clear();
  for (const row of result.rows) {
    smartSet.set(row.address.toLowerCase(), {
      walletId: row.wallet_id,
      rank: parseInt(row.rank),
      pnl30d: row.pnl_30d,
      winRate30d: row.win_rate_30d,
    });
  }
  
  console.log(`✅ Loaded ${smartSet.size} smart traders`);
}

/**
 * 定期刷新 Smart Set（每小时）
 */
function startSmartSetRefresh(): void {
  setInterval(async () => {
    try {
      await loadSmartSet(500);
    } catch (error) {
      console.error('Error refreshing smart set:', error);
    }
  }, 60 * 60 * 1000); // 每小时刷新
}

// ===== Position State Engine =====

function getPositionKey(address: string, coin: string): string {
  return `${address.toLowerCase()}:${coin}`;
}

function getPositionState(address: string, coin: string): PositionState {
  const key = getPositionKey(address, coin);
  if (!positionMap.has(key)) {
    positionMap.set(key, {
      szi: 0,
      avgEntryPx: 0,
      realizedPnl: 0,
      lastTradeTs: 0,
    });
  }
  return positionMap.get(key)!;
}

/**
 * 应用一笔成交到仓位状态
 */
function applyFill(params: {
  user: string;
  coin: string;
  side: 'B' | 'A';
  price: number;
  size: number;
  time: number;
}): TokenFlowEvent | null {
  const { user, coin, side, price, size, time } = params;
  const traderMeta = smartSet.get(user.toLowerCase());
  if (!traderMeta) return null;
  
  const state = getPositionState(user, coin);
  const oldSzi = state.szi;
  const oldSide = oldSzi > 0.0001 ? 'long' : oldSzi < -0.0001 ? 'short' : 'flat';
  
  // 计算仓位变化
  // Buy (B) = 增加多头 / 减少空头
  // Sell (A) = 减少多头 / 增加空头
  const delta = side === 'B' ? size : -size;
  const newSzi = oldSzi + delta;
  const newSide = newSzi > 0.0001 ? 'long' : newSzi < -0.0001 ? 'short' : 'flat';
  
  // 判断动作类型
  let action: ActionType | null = null;
  
  // 新开仓
  if (oldSide === 'flat' && newSide === 'long') {
    action = 'open_long';
  } else if (oldSide === 'flat' && newSide === 'short') {
    action = 'open_short';
  }
  // 平仓
  else if (oldSide === 'long' && newSide === 'flat') {
    action = 'close_long';
  } else if (oldSide === 'short' && newSide === 'flat') {
    action = 'close_short';
  }
  // 反手
  else if (oldSide === 'long' && newSide === 'short') {
    action = 'flip_long_to_short';
  } else if (oldSide === 'short' && newSide === 'long') {
    action = 'flip_short_to_long';
  }
  // 加仓
  else if (oldSide === 'long' && newSide === 'long' && Math.abs(newSzi) > Math.abs(oldSzi)) {
    action = 'add_long';
  } else if (oldSide === 'short' && newSide === 'short' && Math.abs(newSzi) > Math.abs(oldSzi)) {
    action = 'add_short';
  }
  // 减仓
  else if (oldSide === 'long' && newSide === 'long' && Math.abs(newSzi) < Math.abs(oldSzi)) {
    action = 'reduce_long';
  } else if (oldSide === 'short' && newSide === 'short' && Math.abs(newSzi) < Math.abs(oldSzi)) {
    action = 'reduce_short';
  }
  
  // 计算已实现 PnL（简化逻辑）
  let realizedPnl = 0;
  if ((oldSide === 'long' && side === 'A') || (oldSide === 'short' && side === 'B')) {
    // 平仓方向
    const closedSize = Math.min(Math.abs(oldSzi), size);
    if (oldSide === 'long') {
      realizedPnl = closedSize * (price - state.avgEntryPx);
    } else {
      realizedPnl = closedSize * (state.avgEntryPx - price);
    }
  }
  
  // 更新平均入场价格
  if (newSide === 'flat') {
    state.avgEntryPx = 0;
  } else if (oldSide === 'flat' || (oldSide !== newSide)) {
    // 新开仓或反手，使用当前价格
    state.avgEntryPx = price;
  } else if (Math.abs(newSzi) > Math.abs(oldSzi)) {
    // 加仓，计算加权平均
    const oldValue = Math.abs(oldSzi) * state.avgEntryPx;
    const newValue = size * price;
    state.avgEntryPx = (oldValue + newValue) / Math.abs(newSzi);
  }
  // 减仓不改变均价
  
  // 更新状态
  state.szi = newSzi;
  state.realizedPnl += realizedPnl;
  state.lastTradeTs = time;
  
  // 如果没有有意义的动作，返回 null
  if (!action) return null;
  
  // 获取当前价格计算 USD 价值
  const currentPrice = priceMap.get(coin) || price;
  
  // oldPositionUsd: 变化前的仓位价值（使用 oldSzi）
  const oldPositionUsd = Math.abs(oldSzi) * currentPrice;
  // newPositionUsd: 变化后的仓位价值
  const newPositionUsd = Math.abs(newSzi) * currentPrice;
  // sizeUsd: 仓位变化量（绝对值差）
  const sizeUsd = Math.abs(newPositionUsd - oldPositionUsd);
  
  // 创建事件
  const event: TokenFlowEvent = {
    symbol: coin,
    address: user,
    walletId: traderMeta.walletId,
    action,
    side,
    price,
    size,
    sizeUsd,
    oldPosition: Math.abs(oldSzi),
    oldPositionUsd,
    newPosition: Math.abs(newSzi),
    newPositionUsd,
    newSide,
    avgEntryPx: state.avgEntryPx,
    traderRank: traderMeta.rank,
    pnl30d: traderMeta.pnl30d,
    winRate30d: traderMeta.winRate30d,
    timestamp: time,
  };
  
  return event;
}

/**
 * 获取聚合 key（包含方向，避免买入和卖出操作被错误聚合）
 */
function getAggregationKey(address: string, symbol: string, side: 'B' | 'A'): string {
  return `${address.toLowerCase()}:${symbol}:${side}`;
}

/**
 * 将事件添加到聚合缓冲区
 */
function addToAggregationBuffer(event: TokenFlowEvent): void {
  const key = getAggregationKey(event.address, event.symbol, event.side);
  const existing = aggregationBuffer.get(key);
  
  if (existing) {
    // 聚合：累加 size 和 sizeUsd，更新最终仓位状态
    // 加权平均价格
    const totalSize = existing.size + event.size;
    const weightedPrice = (existing.price * existing.size + event.price * event.size) / totalSize;
    
    existing.size = totalSize;
    existing.sizeUsd = existing.sizeUsd + event.sizeUsd;
    existing.price = weightedPrice;
    // 保留最新的仓位状态
    existing.newPosition = event.newPosition;
    existing.newPositionUsd = event.newPositionUsd;
    existing.newSide = event.newSide;
    existing.avgEntryPx = event.avgEntryPx;
    // 保留最新时间
    existing.timestamp = event.timestamp;
    // 更新 action（基于初始和最终仓位）
    existing.action = event.action;
  } else {
    // 新事件，存入缓冲区
    aggregationBuffer.set(key, { ...event });
  }
  
  // 启动或重置聚合定时器
  scheduleAggregationFlush();
}

/**
 * 调度聚合刷新（使用防抖策略，每次新事件重置定时器）
 */
function scheduleAggregationFlush(): void {
  // 清除旧定时器
  if (aggregationTimer) {
    clearTimeout(aggregationTimer);
  }
  
  // 创建新定时器
  aggregationTimer = setTimeout(() => {
    flushAggregationBuffer();
  }, AGGREGATION_WINDOW_MS);
}

/**
 * 刷新聚合缓冲区，发送聚合后的事件
 */
function flushAggregationBuffer(): void {
  aggregationTimer = null;
  
  // 获取并清空缓冲区
  const events = Array.from(aggregationBuffer.values());
  aggregationBuffer.clear();
  
  // 处理每个聚合后的事件
  for (const event of events) {
    onFlowEvent(event);
  }
}

/**
 * 处理一笔交易
 */
function handleTrade(trade: WsTrade): void {
  const { coin, side, px, sz, time, users } = trade;
  const price = parseFloat(px);
  const size = parseFloat(sz);
  const [buyer, seller] = users;
  
  // 只关心 smart money
  const buyerIsSmart = smartSet.has(buyer.toLowerCase());
  const sellerIsSmart = smartSet.has(seller.toLowerCase());
  
  if (!buyerIsSmart && !sellerIsSmart) return;
  
  // 处理买方
  if (buyerIsSmart) {
    const event = applyFill({ user: buyer, coin, side: 'B', price, size, time });
    if (event) {
      addToAggregationBuffer(event);
    }
  }
  
  // 处理卖方
  if (sellerIsSmart) {
    const event = applyFill({ user: seller, coin, side: 'A', price, size, time });
    if (event) {
      addToAggregationBuffer(event);
    }
  }
}

/**
 * 处理事件（存储 + 推送）
 */
async function onFlowEvent(event: TokenFlowEvent): Promise<void> {
  // 打印日志
  const emoji = event.action.includes('long') ? '🟢' : '🔴';
  console.log(
    `${emoji} [${new Date(event.timestamp).toLocaleTimeString()}] ` +
    `Rank #${event.traderRank} ${event.address.slice(0, 8)}... ` +
    `${event.action} ${event.symbol} $${event.sizeUsd.toFixed(0)}`
  );
  
  // 写入数据库
  try {
    await db.query(`
      INSERT INTO token_flow_events (
        ts, symbol, wallet_id, address, action,
        size_change, size_change_usd, old_size, old_notional_usd, new_size, new_notional_usd, new_side,
        fill_price, entry_price, leverage,
        trader_rank, pnl_30d, win_rate_30d
      ) VALUES (
        to_timestamp($1 / 1000.0), $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18
      )
    `, [
      event.timestamp, event.symbol, event.walletId, event.address, event.action,
      event.size, event.sizeUsd, event.oldPosition, event.oldPositionUsd, event.newPosition, event.newPositionUsd, event.newSide,
      event.price, event.avgEntryPx, 1,
      event.traderRank, event.pnl30d, event.winRate30d,
    ]);
    
    // 使用 PostgreSQL NOTIFY 通知 API 服务器（用于跨进程通信）
    const eventPayload = JSON.stringify({
      id: `${event.walletId}-${event.timestamp}`,
      timestamp: event.timestamp,
      symbol: event.symbol,
      address: event.address,
      action: event.action,
      side: event.side,
      price: event.price,
      size: event.size,
      sizeUsd: event.sizeUsd,
      oldPosition: event.oldPosition,
      oldPositionUsd: event.oldPositionUsd,
      newPosition: event.newPosition,
      newPositionUsd: event.newPositionUsd,
      newSide: event.newSide,
      avgEntryPx: event.avgEntryPx,
      rank: event.traderRank,
      pnl30d: event.pnl30d,
      winRate30d: event.winRate30d,
    });
    await db.query(`SELECT pg_notify('flow_events', $1)`, [eventPayload]);
  } catch (error) {
    console.error('Error saving flow event:', error);
  }
  
  // 更新 position_states 表
  try {
    if (event.newSide === 'flat') {
      await db.query(`
        DELETE FROM position_states WHERE wallet_id = $1 AND symbol = $2
      `, [event.walletId, event.symbol]);
    } else {
      await db.query(`
        INSERT INTO position_states (wallet_id, symbol, side, size, notional_usd, entry_price, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (wallet_id, symbol) DO UPDATE SET
          side = EXCLUDED.side,
          size = EXCLUDED.size,
          notional_usd = EXCLUDED.notional_usd,
          entry_price = EXCLUDED.entry_price,
          updated_at = NOW()
      `, [event.walletId, event.symbol, event.newSide, event.newPosition, event.newPositionUsd, event.avgEntryPx]);
    }
  } catch (error) {
    console.error('Error updating position state:', error);
  }
  
  // 发射事件（供 WebSocket 推送使用）
  eventEmitter.emit('flow', event);
  
  // 发送 Telegram 通知（异步，不阻塞，带去重）
  if (shouldSendNotification(event)) {
    sendTradeNotification(event.address, {
      symbol: event.symbol,
      action: event.action,
      sizeUsd: event.sizeUsd,
      price: event.price,
      newSide: event.newSide,
      newPositionUsd: event.newPositionUsd,
      traderRank: event.traderRank,
      timestamp: event.timestamp,
    }).catch(err => {
      console.error('Failed to send Telegram notification:', err);
    });
  }
}

// ===== WebSocket Connection =====

function connectWebSocket(): void {
  console.log('🔌 Connecting to Hyperliquid WebSocket...');
  
  ws = new WebSocket(HL_WS_URL);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    reconnectAttempts = 0;
    
    // 订阅 allMids（价格）
    ws!.send(JSON.stringify({
      method: 'subscribe',
      subscription: { type: 'allMids' },
    }));
    
    // 订阅各币种的 trades
    for (const coin of WATCHED_COINS) {
      ws!.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'trades', coin },
      }));
    }
    
    console.log(`📡 Subscribed to ${WATCHED_COINS.length} coins`);
  });
  
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg: WsMessage = JSON.parse(data.toString());
      
      if (msg.channel === 'allMids') {
        // 更新价格
        const prices = msg.data as Record<string, string>;
        for (const [coin, price] of Object.entries(prices)) {
          priceMap.set(coin, parseFloat(price));
        }
      } else if (msg.channel === 'trades') {
        // 处理交易
        const trades = msg.data as WsTrade[];
        for (const trade of trades) {
          handleTrade(trade);
        }
      }
    } catch (error) {
      // Ignore parse errors for ping/pong
    }
  });
  
  ws.on('close', () => {
    console.log('❌ WebSocket disconnected');
    scheduleReconnect();
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  // 心跳
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'ping' }));
    }
  }, 30000);
}

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnect attempts reached, giving up');
    return;
  }
  
  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  setTimeout(() => {
    connectWebSocket();
  }, delay);
}

// ===== REST API for Initial State =====

/**
 * 服务启动时，使用 REST API 加载当前仓位
 */
async function loadInitialPositions(): Promise<void> {
  console.log('📊 Loading initial positions for smart traders...');
  
  const addresses = Array.from(smartSet.keys()).slice(0, 100); // 先加载 Top 100
  let loaded = 0;
  
  for (const address of addresses) {
    try {
      const response = await fetch(`${HL_API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: address,
        }),
      });
      
      if (!response.ok) continue;
      
      const data = await response.json() as { assetPositions?: Array<{ position: { coin: string; szi: string; entryPx: string } }> };
      
      for (const ap of data.assetPositions || []) {
        const pos = ap.position;
        const szi = parseFloat(pos.szi);
        if (Math.abs(szi) < 0.0001) continue;
        
        const key = getPositionKey(address, pos.coin);
        positionMap.set(key, {
          szi,
          avgEntryPx: parseFloat(pos.entryPx),
          realizedPnl: 0,
          lastTradeTs: Date.now(),
        });
      }
      
      loaded++;
      if (loaded % 10 === 0) {
        process.stdout.write(`\r📊 Loaded positions: ${loaded}/${addresses.length}`);
      }
      
      // 避免 API 限制
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Ignore individual errors
    }
  }
  
  console.log(`\n✅ Loaded initial positions for ${loaded} traders`);
}

// ===== Public API =====

/**
 * 启动 Position Engine
 */
export async function startPositionEngine(topN: number = 500): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════╗
║       Position State Engine (WebSocket Mode)       ║
╠════════════════════════════════════════════════════╣
║  Data Source: Hyperliquid Public Trades WS         ║
║  Watched Coins: ${WATCHED_COINS.length.toString().padEnd(33)}║
║  Smart Set Size: ${topN.toString().padEnd(32)}║
╚════════════════════════════════════════════════════╝
  `);
  
  // 1. 加载 Smart Set
  await loadSmartSet(topN);
  
  // 2. 加载初始仓位（可选，用于状态校准）
  await loadInitialPositions();
  
  // 3. 启动 WebSocket
  connectWebSocket();
  
  // 4. 定期刷新 Smart Set
  startSmartSetRefresh();
  
  console.log('\n🚀 Position Engine is running!');
}

/**
 * 运行一次位置扫描（用于测试/调试）
 */
export async function runPositionScan(topN: number = 500): Promise<TokenFlowEvent[]> {
  console.log('⚠️  runPositionScan is deprecated, use startPositionEngine instead');
  await loadSmartSet(topN);
  return [];
}

/**
 * 获取某个币种的当前 Smart Money 持仓统计
 */
export function getPositionStats(coin: string): {
  totalLong: number;
  totalShort: number;
  longCount: number;
  shortCount: number;
} {
  let totalLong = 0;
  let totalShort = 0;
  let longCount = 0;
  let shortCount = 0;
  
  const price = priceMap.get(coin) || 0;
  
  for (const [key, state] of positionMap.entries()) {
    if (!key.endsWith(`:${coin}`)) continue;
    
    if (state.szi > 0.0001) {
      totalLong += state.szi * price;
      longCount++;
    } else if (state.szi < -0.0001) {
      totalShort += Math.abs(state.szi) * price;
      shortCount++;
    }
  }
  
  return { totalLong, totalShort, longCount, shortCount };
}
