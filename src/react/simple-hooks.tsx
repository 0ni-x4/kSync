import { useState, useEffect, useCallback, useRef } from 'react';
import { createKSync, SimpleKSync, SimpleKSyncConfig } from '../simple';

// 🎯 The main hook - just works!
export function useKSync(config: SimpleKSyncConfig = {}) {
  const [ksync] = useState(() => createKSync(config));
  const [status, setStatus] = useState(ksync.getStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(ksync.getStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [ksync]);

  const send = useCallback((type: string, data: any) => {
    return ksync.send(type, data);
  }, [ksync]);

  const on = useCallback((type: string, callback: (data: any) => void) => {
    return ksync.on(type, callback);
  }, [ksync]);

  const sync = useCallback(() => {
    return ksync.sync();
  }, [ksync]);

  return {
    send,
    on,
    sync,
    status,
    ksync
  };
}

// 💬 Chat hook - for chat apps
export function useChat(room = 'chat', userId?: string) {
  const { send, on, status } = useKSync({ 
    room, 
    userId, 
    debug: true 
  });
  
  const [messages, setMessages] = useState<any[]>([]);
  const [typing, setTyping] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribeMessage = on('message', (data: any) => {
      setMessages(prev => [...prev, data]);
    });

    const unsubscribeTyping = on('typing', (data: any) => {
      setTyping(prev => new Set([...prev, data.userId]));
      setTimeout(() => {
        setTyping(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      }, 3000);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeTyping();
    };
  }, [on]);

  const sendMessage = useCallback((text: string) => {
    return send('message', { 
      text, 
      timestamp: Date.now(),
      userId: status.userId 
    });
  }, [send, status.userId]);

  const sendTyping = useCallback(() => {
    return send('typing', { userId: status.userId });
  }, [send, status.userId]);

  return {
    messages,
    sendMessage,
    sendTyping,
    typing: Array.from(typing),
    status
  };
}

// ✅ Todo hook - for todo apps
export function useTodos(userId?: string) {
  const { send, on, status } = useKSync({ 
    room: 'todos', 
    userId,
    offlineStorage: true,
    debug: true 
  });
  
  const [todos, setTodos] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeTodoAdded = on('todo-added', (data: any) => {
      setTodos(prev => [...prev, data]);
    });

    const unsubscribeTodoUpdated = on('todo-updated', (data: any) => {
      setTodos(prev => prev.map(todo => 
        todo.id === data.id ? { ...todo, ...data } : todo
      ));
    });

    const unsubscribeTodoDeleted = on('todo-deleted', (data: any) => {
      setTodos(prev => prev.filter(todo => todo.id !== data.id));
    });

    return () => {
      unsubscribeTodoAdded();
      unsubscribeTodoUpdated();
      unsubscribeTodoDeleted();
    };
  }, [on]);

  const addTodo = useCallback((text: string) => {
    const todo = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      completed: false,
      createdAt: Date.now(),
      userId: status.userId
    };

    return send('todo-added', todo);
  }, [send, status.userId]);

  const toggleTodo = useCallback((id: string) => {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      return send('todo-updated', { 
        id, 
        completed: !todo.completed,
        updatedAt: Date.now()
      });
    }
  }, [send, todos]);

  const deleteTodo = useCallback((id: string) => {
    return send('todo-deleted', { id });
  }, [send]);

  return {
    todos,
    addTodo,
    toggleTodo,
    deleteTodo,
    status
  };
}

// 🎮 Multiplayer game hook
export function useGame(gameId: string, userId: string) {
  const { send, on, status } = useKSync({ 
    room: `game-${gameId}`, 
    userId,
    debug: true 
  });
  
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({});

  useEffect(() => {
    const unsubscribePlayerJoined = on('player-joined', (data: any) => {
      setPlayers(prev => [...prev.filter(p => p.id !== data.id), data]);
    });

    const unsubscribePlayerLeft = on('player-left', (data: any) => {
      setPlayers(prev => prev.filter(p => p.id !== data.id));
    });

    const unsubscribeGameUpdate = on('game-update', (data: any) => {
      setGameState((prev: any) => ({ ...prev, ...data }));
    });

    const unsubscribePlayerMove = on('player-move', (data: any) => {
      setPlayers(prev => prev.map(player => 
        player.id === data.playerId 
          ? { ...player, position: data.position }
          : player
      ));
    });

    return () => {
      unsubscribePlayerJoined();
      unsubscribePlayerLeft();
      unsubscribeGameUpdate();
      unsubscribePlayerMove();
    };
  }, [on]);

  const joinGame = useCallback((playerData: any) => {
    return send('player-joined', { 
      id: userId, 
      ...playerData, 
      joinedAt: Date.now() 
    });
  }, [send, userId]);

  const movePlayer = useCallback((position: { x: number; y: number }) => {
    return send('player-move', { 
      playerId: userId, 
      position,
      timestamp: Date.now()
    });
  }, [send, userId]);

  const updateGame = useCallback((updates: any) => {
    return send('game-update', { 
      ...updates, 
      updatedBy: userId,
      timestamp: Date.now()
    });
  }, [send, userId]);

  return {
    players,
    gameState,
    joinGame,
    movePlayer,
    updateGame,
    status
  };
}

// 🤖 AI Streaming hook - simplified!
export function useAIStream(conversationId?: string) {
  const { send, on, status } = useKSync({ 
    room: conversationId || 'ai-chat',
    debug: true 
  });
  
  const [messages, setMessages] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');

  useEffect(() => {
    const unsubscribeMessage = on('message', (data: any) => {
      setMessages(prev => [...prev, data]);
    });

    const unsubscribeStreamStart = on('stream-start', (data: any) => {
      setIsStreaming(true);
      setCurrentResponse('');
      setMessages(prev => [...prev, { 
        id: data.messageId,
        role: 'assistant',
        content: '',
        streaming: true,
        timestamp: Date.now()
      }]);
    });

    const unsubscribeStreamChunk = on('stream-chunk', (data: any) => {
      setCurrentResponse((prev: string) => prev + data.text);
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { ...msg, content: msg.content + data.text }
          : msg
      ));
    });

    const unsubscribeStreamEnd = on('stream-end', (data: any) => {
      setIsStreaming(false);
      setCurrentResponse('');
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { ...msg, streaming: false, completed: true }
          : msg
      ));
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStreamStart();
      unsubscribeStreamChunk();
      unsubscribeStreamEnd();
    };
  }, [on]);

  const sendMessage = useCallback((content: string) => {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Add user message
    send('message', {
      id: messageId,
      role: 'user',
      content,
      timestamp: Date.now(),
      userId: status.userId
    });

    // Request AI response
    return send('ai-request', {
      messageId,
      content,
      conversationId: conversationId || 'ai-chat',
      userId: status.userId
    });
  }, [send, status.userId, conversationId]);

  return {
    messages,
    sendMessage,
    isStreaming,
    currentResponse,
    status
  };
}

// 👥 Presence hook - who's online
export function usePresence(room = 'default') {
  const { send, on, status } = useKSync({ room, debug: true });
  const [users, setUsers] = useState<any[]>([]);
  const lastHeartbeat = useRef<number>(0);

  useEffect(() => {
    const unsubscribeUserJoined = on('user-joined', (data: any) => {
      setUsers(prev => [...prev.filter(u => u.clientId !== data.clientId), data]);
    });

    const unsubscribeUserLeft = on('user-left', (data: any) => {
      setUsers(prev => prev.filter(u => u.clientId !== data.clientId));
    });

    const unsubscribeHeartbeat = on('heartbeat', (data: any) => {
      setUsers(prev => prev.map(user => 
        user.clientId === data.clientId 
          ? { ...user, lastSeen: Date.now() }
          : user
      ));
    });

    // Send periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (Date.now() - lastHeartbeat.current > 10000) { // Every 10 seconds
        send('heartbeat', { 
          clientId: status.userId,
          timestamp: Date.now()
        });
        lastHeartbeat.current = Date.now();
      }
    }, 10000);

    return () => {
      unsubscribeUserJoined();
      unsubscribeUserLeft();
      unsubscribeHeartbeat();
      clearInterval(heartbeatInterval);
    };
  }, [on, send, status.userId]);

  return {
    users,
    onlineCount: users.length,
    status
  };
}

// 📱 Quick status component
export function SyncStatus({ ksync }: { ksync: SimpleKSync }) {
  const [status, setStatus] = useState(ksync.getStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(ksync.getStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [ksync]);

  const getStatusColor = () => {
    if (!status.online) return '🔴';
    if (!status.connected) return '🟡';
    return '🟢';
  };

  const getStatusText = () => {
    if (!status.online) return 'Offline';
    if (!status.connected) return 'Connecting...';
    if (status.queuedMessages > 0) return `Syncing (${status.queuedMessages})`;
    return 'Connected';
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px',
      padding: '4px 8px',
      borderRadius: '4px',
      background: status.connected ? '#e8f5e8' : '#fff3e0',
      fontSize: '14px'
    }}>
      <span>{getStatusColor()}</span>
      <span>{getStatusText()}</span>
    </div>
  );
} 