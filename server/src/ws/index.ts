/**
 * WebSocket Server for Real-time Token Flow Events
 * 
 * 客户端可以订阅：
 * - 全部事件: { type: 'subscribe', channel: 'flow' }
 * - 特定币种: { type: 'subscribe', channel: 'flow', coin: 'BTC' }
 * - 取消订阅: { type: 'unsubscribe', channel: 'flow' }
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { eventEmitter } from '../worker/positionEngine.js';

interface ClientSubscription {
  channel: 'flow';
  coin?: string; // 如果为 undefined，订阅全部币种
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
  const { type, channel, coin } = msg;
  
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

function setupEventListener(): void {
  eventEmitter.on('flow', (event) => {
    const message = JSON.stringify({
      type: 'flow',
      data: {
        id: `${event.walletId}-${event.timestamp}`,
        timestamp: event.timestamp,
        symbol: event.symbol,
        address: event.address,
        action: event.action,
        side: event.side,
        price: event.price,
        size: event.size,
        sizeUsd: event.sizeUsd,
        newPosition: event.newPosition,
        newPositionUsd: event.newPositionUsd,
        newSide: event.newSide,
        avgEntryPx: event.avgEntryPx,
        rank: event.traderRank,
        pnl30d: event.pnl30d,
        winRate30d: event.winRate30d,
      },
    });
    
    // 广播给所有订阅的客户端
    clients.forEach(client => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      
      const isSubscribed = client.subscriptions.some(
        s => s.channel === 'flow' && (!s.coin || s.coin === event.symbol)
      );
      
      if (isSubscribed) {
        client.ws.send(message);
      }
    });
  });
  
  console.log('📡 Listening for Position Engine events');
}

/**
 * 获取当前连接的客户端数量
 */
export function getClientCount(): number {
  return clients.size;
}

