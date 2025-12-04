/**
 * WebSocket Server for Real-time Token Flow Events
 * 
 * 使用 PostgreSQL LISTEN/NOTIFY 实现跨进程事件传递
 * 
 * 客户端可以订阅：
 * - 全部事件: { type: 'subscribe', channel: 'flow' }
 * - 特定币种: { type: 'subscribe', channel: 'flow', coin: 'BTC' }
 * - 取消订阅: { type: 'unsubscribe', channel: 'flow' }
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import db from '../db/index.js';

interface ClientSubscription {
  channel: 'flow' | 'dump-radar';
  coin?: string; // 如果为 undefined，订阅全部币种
  tokenId?: number; // 用于 dump-radar 订阅特定代币
}

interface WsClient {
  ws: WebSocket;
  subscriptions: ClientSubscription[];
  isAlive: boolean;
}

const clients = new Set<WsClient>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
  });
  
  console.log('🔌 WebSocket server initialized on /ws');
  
  wss.on('connection', (ws: WebSocket) => {
    const client: WsClient = {
      ws,
      subscriptions: [],
      isAlive: true,
    };
    
    clients.add(client);
    console.log(`📱 Client connected (total: ${clients.size})`);
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Smart Perp WebSocket',
      timestamp: Date.now(),
    }));
    
    // 处理客户端消息
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(client, msg);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid JSON',
        }));
      }
    });
    
    // 心跳检测
    ws.on('pong', () => {
      client.isAlive = true;
    });
    
    ws.on('close', () => {
      clients.delete(client);
      console.log(`📱 Client disconnected (total: ${clients.size})`);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      clients.delete(client);
    });
  });
  
  // 心跳检测间隔
  const heartbeatInterval = setInterval(() => {
    clients.forEach(client => {
      if (!client.isAlive) {
        client.ws.terminate();
        clients.delete(client);
        return;
      }
      client.isAlive = false;
      client.ws.ping();
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
  
  // 监听 Position Engine 事件
  setupEventListener();
  
  return wss;
}

function handleClientMessage(client: WsClient, msg: any): void {
  const { type, channel, coin, tokenId } = msg;
  
  switch (type) {
    case 'subscribe':
      if (channel === 'flow') {
        // 检查是否已订阅
        const existing = client.subscriptions.find(
          s => s.channel === 'flow' && s.coin === coin
        );
        if (!existing) {
          client.subscriptions.push({ channel: 'flow', coin });
          client.ws.send(JSON.stringify({
            type: 'subscribed',
            channel: 'flow',
            coin: coin || 'all',
          }));
          console.log(`📡 Client subscribed to flow:${coin || 'all'}`);
        }
      } else if (channel === 'dump-radar') {
        // Dump Radar 订阅
        const existing = client.subscriptions.find(
          s => s.channel === 'dump-radar' && s.tokenId === tokenId
        );
        if (!existing) {
          client.subscriptions.push({ channel: 'dump-radar', tokenId });
          client.ws.send(JSON.stringify({
            type: 'subscribed',
            channel: 'dump-radar',
            tokenId: tokenId || 'all',
          }));
          console.log(`📡 Client subscribed to dump-radar:${tokenId || 'all'}`);
        }
      }
      break;
      
    case 'unsubscribe':
      if (channel === 'flow') {
        client.subscriptions = client.subscriptions.filter(
          s => !(s.channel === 'flow' && s.coin === coin)
        );
        client.ws.send(JSON.stringify({
          type: 'unsubscribed',
          channel: 'flow',
          coin: coin || 'all',
        }));
      } else if (channel === 'dump-radar') {
        client.subscriptions = client.subscriptions.filter(
          s => !(s.channel === 'dump-radar' && s.tokenId === tokenId)
        );
        client.ws.send(JSON.stringify({
          type: 'unsubscribed',
          channel: 'dump-radar',
          tokenId: tokenId || 'all',
        }));
      }
      break;
      
    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${type}`,
      }));
  }
}

async function setupEventListener(): Promise<void> {
  try {
    // 获取专用连接用于 LISTEN
    const client = await db.getClient();
    
    // 监听 flow_events 通道
    await client.query('LISTEN flow_events');
    console.log('📡 Listening for PostgreSQL flow_events notifications');
    
    // 处理通知
    client.on('notification', (msg) => {
      if (msg.channel !== 'flow_events' || !msg.payload) return;
      
      try {
        const event = JSON.parse(msg.payload);
        const message = JSON.stringify({
          type: 'flow',
          data: event,
        });
        
        // 广播给所有订阅的客户端
        clients.forEach(wsClient => {
          if (wsClient.ws.readyState !== WebSocket.OPEN) return;
          
          const isSubscribed = wsClient.subscriptions.some(
            s => s.channel === 'flow' && (!s.coin || s.coin === event.symbol)
          );
          
          if (isSubscribed) {
            wsClient.ws.send(message);
          }
        });
      } catch (error) {
        console.error('Error parsing flow event notification:', error);
      }
    });
    
    // 处理连接错误
    client.on('error', (error) => {
      console.error('PostgreSQL LISTEN connection error:', error);
      // 尝试重新连接
      setTimeout(() => setupEventListener(), 5000);
    });
    
  } catch (error) {
    console.error('Failed to setup PostgreSQL LISTEN:', error);
    // 5秒后重试
    setTimeout(() => setupEventListener(), 5000);
  }
}

/**
 * 获取当前连接的客户端数量
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * 广播 Dump Radar 事件到订阅的客户端
 */
export function broadcastDumpRadarEvent(event: {
  id: number;
  token_id: number;
  network_id: string;
  tx_hash: string;
  from_address: string;
  to_address: string;
  to_binance_label: string | null;
  amount_formatted: number | null;
  amount_usd: number | null;
  from_label: string | null;
  from_tag: string | null;
  tx_timestamp: Date;
  token_symbol?: string;
  network_name?: string;
  explorer_url?: string;
}): void {
  const message = JSON.stringify({
    type: 'dump-radar',
    data: {
      id: event.id,
      tokenId: event.token_id,
      networkId: event.network_id,
      txHash: event.tx_hash,
      fromAddress: event.from_address,
      toAddress: event.to_address,
      toBinanceLabel: event.to_binance_label,
      amountFormatted: event.amount_formatted,
      amountUsd: event.amount_usd,
      fromLabel: event.from_label,
      fromTag: event.from_tag,
      timestamp: event.tx_timestamp,
      tokenSymbol: event.token_symbol,
      networkName: event.network_name,
      explorerUrl: event.explorer_url,
    },
  });

  let sentCount = 0;
  clients.forEach(client => {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    // 检查是否订阅了 dump-radar
    const isSubscribed = client.subscriptions.some(
      s => s.channel === 'dump-radar' && (!s.tokenId || s.tokenId === event.token_id)
    );

    if (isSubscribed) {
      client.ws.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    console.log(`📤 Broadcasted dump-radar event to ${sentCount} clients`);
  }
}

