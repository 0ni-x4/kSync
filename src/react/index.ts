import React, { useEffect, useState, useCallback, useRef, useMemo, createContext, useContext, ReactNode } from 'react';
import { KSync } from '../core';
import { KSyncEvent, EventListener } from '../types';
import { DrizzleKSyncAdapter, QueryResult, WhereClause, OrderClause } from '../drizzle';
import { KSyncMultistore } from '../multistore';

// Hook for basic kSync instance
export function useKSync(ksync: KSync) {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeKSync = async () => {
      if (!isInitialized) {
        await ksync.initialize();
        setIsInitialized(true);
        setIsConnected(true);
      }
    };

    initializeKSync();

    // Cleanup on unmount
    return () => {
      ksync.close();
    };
  }, [ksync, isInitialized]);

  return {
    ksync,
    isConnected,
    isInitialized
  };
}

// Hook for listening to events
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

// Hook for sending events
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
  materializerName: string,
  dependencies: any[] = []
): T | undefined {
  const [state, setState] = useState<T | undefined>();

  useEffect(() => {
    const updateState = () => {
      const newState = ksync.getState();
      setState(newState);
    };

    // Listen for any event that might change state
    const listener = () => updateState();
    ksync.on('*', listener);

    // Get initial state
    updateState();

    return () => {
      ksync.off('*', listener);
    };
  }, [ksync, materializerName, ...dependencies]);

  return state;
}

// Hook for Drizzle queries
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

// Hook for real-time Drizzle queries with auto-refresh
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

// Hook for multistore
export function useMultistore(multistore: KSyncMultistore) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [storeNames, setStoreNames] = useState<string[]>([]);

  useEffect(() => {
    const initialize = async () => {
      await multistore.initialize();
      setIsInitialized(true);
      setStoreNames(multistore.getStoreNames());
    };

    initialize();

    return () => {
      multistore.close();
    };
  }, [multistore]);

  const getStore = useCallback((name: string) => {
    return multistore.getStore(name);
  }, [multistore]);

  const getDrizzle = useCallback((name: string) => {
    return multistore.getDrizzle(name);
  }, [multistore]);

  return {
    isInitialized,
    storeNames,
    getStore,
    getDrizzle,
    multistore
  };
}

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

// Context provider for kSync
const KSyncContext = createContext<KSync | null>(null);

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