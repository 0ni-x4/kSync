import React, { useEffect, useState, useCallback, useRef, useMemo, createContext, useContext, ReactNode } from 'react';
import { KSync } from '../core.js';
import { KSyncEvent, EventListener } from '../types.js';
// TODO: Fix these imports after fixing the modules
// import { DrizzleKSyncAdapter, QueryResult, WhereClause, OrderClause } from '../drizzle/index.js';
// import { KSyncMultistore } from '../multistore/index.js';

// Context for provider pattern
const KSyncContext = createContext<KSync | null>(null);

// Hook for easy one-line sync setup
export function useKSync(config?: {
  room?: string;
  serverUrl?: string;
  userId?: string;
  debug?: boolean;
}): {
  ksync: KSync;
  send: (type: string, data: any) => Promise<void>;
  state: any;
  isConnected: boolean;
  isOnline: boolean;
} {
  // Create stable config reference
  const stableConfig = useMemo(() => ({
    room: config?.room || 'default',
    serverUrl: config?.serverUrl || 'ws://localhost:8080/ws',
    userId: config?.userId || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    debug: config?.debug || false,
    sync: {
      enabled: true,
      mode: 'realtime' as const,
      options: {
        autoReconnect: true,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000,
      }
    },
    storage: {
      type: 'memory' as const,
      options: {
        persistEvents: false, // Disable for simplicity in dev
        maxEvents: 1000,
      }
    },
    offline: {
      enabled: true,
      syncOnReconnect: true,
    },
    state: {
      autoMaterialize: true,
      materializer: (events: KSyncEvent[]) => {
        // Simple state materialization - merge all events by type
        const state: any = {};
        events.forEach(event => {
          if (!state[event.type]) {
            state[event.type] = [];
          }
          state[event.type].push(event.data);
        });
        return state;
      }
    }
  }), [config?.room, config?.serverUrl, config?.userId, config?.debug]);

  // Create KSync instance with stable config
  const ksync = useMemo(() => {
    return new KSync(stableConfig);
  }, [stableConfig]);

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<any>({});
  const [isOnline, setIsOnline] = useState(true);

  // Initialize and connect
  useEffect(() => {
    let mounted = true;

    const initializeKSync = async () => {
      try {
        await ksync.initialize();
        
        // Auto-connect if serverUrl provided
        if (stableConfig.serverUrl) {
          await ksync.connect();
        }

        if (mounted) {
          setIsConnected(ksync.getStatus().connected);
          setState(ksync.getState());
        }
      } catch (error) {
        console.error('kSync initialization failed:', error);
      }
    };

    // Connection event handlers
    const handleConnect = () => {
      if (mounted) {
        setIsConnected(true);
        setIsOnline(true);
      }
    };

    const handleDisconnect = () => {
      if (mounted) {
        setIsConnected(false);
      }
    };

    const handleEvent = () => {
      if (mounted) {
        setState(ksync.getState());
      }
    };

    const handleOnline = () => {
      if (mounted) {
        setIsOnline(true);
      }
    };

    const handleOffline = () => {
      if (mounted) {
        setIsOnline(false);
      }
    };

    // Setup event listeners
    ksync.on('connected', handleConnect);
    ksync.on('disconnected', handleDisconnect);
    ksync.on('event', handleEvent);
    ksync.on('online', handleOnline);
    ksync.on('offline', handleOffline);

    // Initialize
    initializeKSync();

    // Cleanup
    return () => {
      mounted = false;
      ksync.off('connected', handleConnect);
      ksync.off('disconnected', handleDisconnect);
      ksync.off('event', handleEvent);
      ksync.off('online', handleOnline);
      ksync.off('offline', handleOffline);
      ksync.close();
    };
  }, [ksync, stableConfig.serverUrl]);

  // Send function
  const send = useCallback(async (type: string, data: any) => {
    try {
      await ksync.send(type, data);
    } catch (error) {
      console.error('Failed to send event:', error);
      throw error;
    }
  }, [ksync]);

  return {
    ksync,
    send,
    state,
    isConnected,
    isOnline,
  };
}

// Hook for listening to specific events
export function useKSyncEvent<T = any>(
  ksync: KSync,
  eventType: string,
  dependencies: any[] = []
): T[] {
  const [events, setEvents] = useState<T[]>([]);

  useEffect(() => {
    const listener: EventListener<T> = (event) => {
      setEvents(prev => [...prev, event.data]);
    };

    ksync.on(eventType, listener);

    // Get existing events
    const existingEvents = ksync.getEvents()
      .filter(event => event.type === eventType)
      .map(event => event.data);
    setEvents(existingEvents);

    return () => {
      ksync.off(eventType, listener);
    };
  }, [ksync, eventType, ...dependencies]);

  return events;
}

// Hook for sending events with loading state
export function useKSyncSend(ksync: KSync) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(async (eventType: string, data: any) => {
    setIsSending(true);
    setError(null);

    try {
      await ksync.send(eventType, data);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsSending(false);
    }
  }, [ksync]);

  return {
    send,
    isSending,
    error
  };
}

// Hook for materialized state
export function useKSyncState<T = any>(
  ksync: KSync,
  materializerName?: string,
  dependencies: any[] = []
): T | undefined {
  const [state, setState] = useState<T | undefined>();

  useEffect(() => {
    // Listen for any event that might change state
    const listener = () => {
      const newState = ksync.getState();
      setState(newState);
    };

    ksync.on('event', listener);

    // Get initial state
    setState(ksync.getState());

    return () => {
      ksync.off('event', listener);
    };
  }, [ksync, materializerName, ...dependencies]);

  return state;
}

// Hook for Drizzle queries - TODO: Re-enable when Drizzle module is fixed
/*
export function useKSyncQuery<T = any>(
  adapter: DrizzleKSyncAdapter,
  tableName: string,
  queryBuilder?: (table: any) => Promise<QueryResult<T>>,
  dependencies: any[] = []
): {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const executeQuery = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const table = adapter.table(tableName);
      const result = queryBuilder 
        ? await queryBuilder(table)
        : await table.findMany({});
      
      setData(Array.isArray(result) ? result : result.data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [adapter, tableName, queryBuilder, ...dependencies]);

  useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  const refetch = useCallback(async () => {
    await executeQuery();
  }, [executeQuery]);

  return {
    data,
    isLoading,
    error,
    refetch
  };
}
*/

// Hook for real-time Drizzle queries with auto-refresh - TODO: Re-enable when Drizzle module is fixed
/*
export function useKSyncLiveQuery<T = any>(
  ksync: KSync,
  adapter: DrizzleKSyncAdapter,
  tableName: string,
  queryBuilder?: (table: any) => Promise<QueryResult<T>>,
  dependencies: any[] = []
): {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const { data, isLoading, error, refetch } = useKSyncQuery(
    adapter,
    tableName,
    queryBuilder,
    dependencies
  );

  // Auto-refresh on relevant events
  useEffect(() => {
    const listener = (event: KSyncEvent) => {
      // Check if event affects this table
      if (event.type.startsWith(`${tableName}:`) || event.type === tableName) {
        refetch();
      }
    };

    ksync.on('*', listener);

    return () => {
      ksync.off('*', listener);
    };
  }, [ksync, tableName, refetch]);

  return {
    data,
    isLoading,
    error,
    refetch
  };
}
*/

// Multistore hook - TODO: Re-enable when Multistore module is fixed
/*
export function useMultistore(multistore: KSyncMultistore) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (!isInitialized) {
        await multistore.initialize();
        setIsInitialized(true);
      }
    };

    initialize();

    return () => {
      multistore.close();
    };
  }, [multistore, isInitialized]);

  return {
    multistore,
    isInitialized
  };
}
*/

// Hook for presence awareness
export function useKSyncPresence(ksync: KSync, initialData?: Record<string, any>) {
  const [presence, setPresence] = useState({});
  const [myPresence, setMyPresence] = useState(initialData || {});

  useEffect(() => {
    const listener = (newPresence: any) => {
      setPresence(newPresence);
    };

    ksync.onPresence(listener);

    return () => {
      // Remove presence listener (implementation would need this method)
    };
  }, [ksync]);

  const updatePresence = useCallback((data: Record<string, any>) => {
    ksync.updatePresence(data);
    setMyPresence(prev => ({ ...prev, ...data }));
  }, [ksync]);

  return {
    presence,
    myPresence,
    updatePresence
  };
}

// Hook for streaming (AI applications)
export function useKSyncStream(ksync: KSync, streamId?: string) {
  const [content, setContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = useCallback(async (options?: any) => {
    setContent('');
    setIsComplete(false);
    setIsStreaming(true);

    const id = await ksync.startStream({
      streamId,
      onChunk: (chunk: string) => {
        setContent(prev => prev + chunk);
      },
      onComplete: (finalContent: string) => {
        setContent(finalContent);
        setIsComplete(true);
        setIsStreaming(false);
      },
      ...options
    });

    return id;
  }, [ksync, streamId]);

  const sendChunk = useCallback(async (id: string, chunk: string) => {
    await ksync.streamChunk(id, { data: chunk });
  }, [ksync]);

  return {
    content,
    isComplete,
    isStreaming,
    startStream,
    sendChunk
  };
}

// Hook for optimistic updates
export function useKSyncOptimistic<T>(
  ksync: KSync,
  eventType: string,
  optimisticUpdater: (currentData: T[], newData: any) => T[]
) {
  const [data, setData] = useState<T[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, any>>(new Map());

  // Listen for confirmed events
  useEffect(() => {
    const listener = (event: KSyncEvent) => {
      if (event.type === eventType) {
        // Remove from pending if it was optimistic
        setPendingUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(event.id);
          return newMap;
        });

        // Update confirmed data
        setData(prev => {
          // Check if this was already added optimistically
          const existingIndex = prev.findIndex((item: any) => item.id === event.data.id);
          if (existingIndex >= 0) {
            // Update existing item
            const newData = [...prev];
            newData[existingIndex] = event.data;
            return newData;
          } else {
            // Add new item
            return optimisticUpdater(prev, event.data);
          }
        });
      }
    };

    ksync.on(eventType, listener);

    return () => {
      ksync.off(eventType, listener);
    };
  }, [ksync, eventType, optimisticUpdater]);

  const sendOptimistic = useCallback(async (data: any, tempId?: string) => {
    const id = tempId || `temp-${Date.now()}-${Math.random()}`;
    
    // Add optimistic update
    setPendingUpdates(prev => new Map(prev).set(id, data));
    setData(prev => optimisticUpdater(prev, { ...data, id, __optimistic: true }));

    try {
      await ksync.send(eventType, { ...data, id });
    } catch (error) {
      // Revert optimistic update on error
      setPendingUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
      
      setData(prev => prev.filter((item: any) => item.id !== id));
      throw error;
    }
  }, [ksync, eventType, optimisticUpdater]);

  return {
    data: useMemo(() => {
      // Merge confirmed data with pending optimistic updates
      return data;
    }, [data]),
    pendingCount: pendingUpdates.size,
    sendOptimistic
  };
}

// Hook for connection status
export function useKSyncConnection(ksync: KSync) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };

    const handleError = (error: Error) => {
      setError(error);
      setIsConnecting(false);
    };

    ksync.on('connected', handleConnect);
    ksync.on('disconnected', handleDisconnect);
    ksync.on('error', handleError);

    // Check initial connection status
    const status = ksync.getStatus();
    setIsConnected(status.connected);

    return () => {
      ksync.off('connected', handleConnect);
      ksync.off('disconnected', handleDisconnect);
      ksync.off('error', handleError);
    };
  }, [ksync]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await ksync.connect();
    } catch (err) {
      setError(err as Error);
      setIsConnecting(false);
    }
  }, [ksync]);

  const disconnect = useCallback(async () => {
    try {
      await ksync.disconnect();
    } catch (err) {
      setError(err as Error);
    }
  }, [ksync]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect
  };
}

export function KSyncProvider({ ksync, children }: { ksync: KSync; children: ReactNode }) {
  return React.createElement(KSyncContext.Provider, { value: ksync }, children);
}

export function useKSyncContext(): KSync {
  const ksync = useContext(KSyncContext);
  if (!ksync) {
    throw new Error('useKSyncContext must be used within a KSyncProvider');
  }
  return ksync;
} 