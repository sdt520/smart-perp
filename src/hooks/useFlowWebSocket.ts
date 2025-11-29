/**
 * WebSocket Hook for Real-time Token Flow Events
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface FlowEvent {
  id: string;
  timestamp: number;
  symbol: string;
  address: string;
  action: string;
  side: 'B' | 'A';
  price: number;
  size: number;
  sizeUsd: number;
  newPosition: number;
  newPositionUsd: number;
  newSide: 'long' | 'short' | 'flat';
  avgEntryPx: number;
  rank: number;
  pnl30d: number;
  winRate30d: number;
}

interface UseFlowWebSocketOptions {
  coin?: string | null;
  enabled?: boolean;
  onEvent?: (event: FlowEvent) => void;
}

interface UseFlowWebSocketReturn {
  isConnected: boolean;
  events: FlowEvent[];
  clearEvents: () => void;
}

const WS_URL = import.meta.env.VITE_WS_URL || 
  (window.location.protocol === 'https:' 
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.host}/ws`);

export function useFlowWebSocket(options: UseFlowWebSocketOptions = {}): UseFlowWebSocketReturn {
  const { coin, enabled = true, onEvent } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  
  // 使用 ref 存储 coin 和 onEvent，避免它们成为 connect 的依赖
  const coinRef = useRef(coin);
  const onEventRef = useRef(onEvent);
  
  // 更新 refs
  useEffect(() => {
    coinRef.current = coin;
  }, [coin]);
  
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);
  
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;
    
    console.log('🔌 Connecting to WebSocket:', WS_URL);
    
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // 订阅 flow 事件（使用当前 coin 值）
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'flow',
          coin: coinRef.current || undefined,
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'flow') {
            const flowEvent: FlowEvent = msg.data;
            
            // 如果指定了 coin，过滤掉其他币种（使用当前 coin 值）
            if (coinRef.current && flowEvent.symbol !== coinRef.current) return;
            
            setEvents(prev => {
              // 避免重复
              if (prev.some(e => e.id === flowEvent.id)) return prev;
              // 限制最多保存 100 条事件
              return [flowEvent, ...prev].slice(0, 100);
            });
            
            // 调用回调（使用当前 onEvent）
            onEventRef.current?.(flowEvent);
          }
        } catch {
          // Ignore parse errors
        }
      };
      
      ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;
        
        // 自动重连
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, []); // 无依赖，只创建一次
  
  // 连接管理 - 只在 enabled 变化时重新连接
  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);
  
  // 币种变化时重新订阅（不重建连接）
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // 取消之前的订阅
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'flow',
      }));
      
      // 新订阅
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channel: 'flow',
        coin: coin || undefined,
      }));
      
      // 清除旧事件
      setEvents([]);
    }
  }, [coin]);
  
  return {
    isConnected,
    events,
    clearEvents,
  };
}
