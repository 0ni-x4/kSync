import { EventEmitter } from 'events';
import { 
  KSyncEvent, 
  KSyncStorage, 
  KSyncSync, 
  WebSocketMessage, 
  StreamChunk,
  PresenceInfo,
  KSyncError
} from './types';
import { MemoryStorage } from './storage/memory';
import { IndexedDBStorage } from './storage/indexeddb';
import { WebSocketSyncClient } from './sync/websocket-client';
import { generateId } from './utils';

// 🎯 Clear, comprehensive configuration with good defaults
export interface KSyncConfig {
  // === CONNECTION OPTIONS ===
  serverUrl?: string;              // WebSocket server URL - if provided, auto-connects
  room?: string;                   // Room to join - defaults to 'default'
  userId?: string;                 // User ID - auto-generated if not provided
  clientId?: string;               // Client ID - auto-generated if not provided (backward compatibility)
  
  // === AUTHENTICATION ===
  auth?: {
    token?: string;                // Static auth token
    provider?: () => Promise<string>; // Dynamic auth provider function
    type?: 'bearer' | 'jwt' | 'custom'; // Auth type for server validation
  };
  
  // === STORAGE CONFIGURATION ===
  storage?: {
    type?: 'memory' | 'indexeddb' | 'file' | 'custom'; // Storage type
    instance?: KSyncStorage;       // Custom storage instance
    options?: {
      persistEvents?: boolean;     // Persist events to storage (default: true)
      maxEvents?: number;         // Maximum events to keep in memory (default: 10000)
      compression?: boolean;       // Compress stored data (default: false)
    };
  };
  
  // === SYNC CONFIGURATION ===
  sync?: {
    enabled?: boolean;             // Enable sync (default: true if serverUrl provided)
    client?: KSyncSync;           // Custom sync client
    mode?: 'realtime' | 'manual'; // Sync mode (default: 'realtime')
    options?: {
      autoReconnect?: boolean;     // Auto-reconnect on disconnect (default: true)
      maxReconnectAttempts?: number; // Max reconnection attempts (default: 5)
      reconnectDelay?: number;     // Delay between attempts in ms (default: 1000)
      heartbeatInterval?: number;  // Heartbeat interval in ms (default: 30000)
    };
  };
  
  // === PERFORMANCE OPTIONS ===
  performance?: {
    batchSize?: number;            // Events per batch (default: 100)
    batchDelay?: number;          // Batch delay in ms (default: 10)
    materializationCaching?: boolean; // Cache materialization results (default: true)
    compressionThreshold?: number; // Compress payloads larger than bytes (default: 1024)
  };
  
  // === OFFLINE SUPPORT ===
  offline?: {
    enabled?: boolean;             // Enable offline support (default: true)
    queueSize?: number;           // Max queued events (default: 1000)
    persistence?: boolean;        // Persist offline queue (default: true)
    syncOnReconnect?: boolean;    // Auto-sync when back online (default: true)
  };
  
  // === STATE MANAGEMENT ===
  state?: {
    materializer?: (events: KSyncEvent[]) => any; // State materialization function
    enableCaching?: boolean;      // Cache materialized state (default: true)
    autoMaterialize?: boolean;    // Auto-materialize on events (default: false)
  };
  
  // === DEBUGGING & MONITORING ===
  debug?: boolean | {
    events?: boolean;             // Log events (default: false)
    sync?: boolean;              // Log sync operations (default: false)
    performance?: boolean;       // Log performance metrics (default: false)
    storage?: boolean;           // Log storage operations (default: false)
  };
  
  // === FEATURE FLAGS ===
  features?: {
    presence?: boolean;           // Enable presence system (default: true)
    streaming?: boolean;          // Enable streaming support (default: true)
    encryption?: boolean;         // Enable client-side encryption (default: false)
  };
}

// 🔧 Internal resolved configuration with all defaults applied
interface ResolvedKSyncConfig {
  serverUrl: string;
  room: string;
  userId: string;
  clientId: string;
  auth: {
    token?: string;
    provider?: () => Promise<string>;
    type: 'bearer' | 'jwt' | 'custom';
  };
  storage: {
    type: 'memory' | 'indexeddb' | 'file' | 'custom';
    instance?: KSyncStorage;
    options: {
      persistEvents: boolean;
      maxEvents: number;
      compression: boolean;
    };
  };
  sync: {
    enabled: boolean;
    client?: KSyncSync;
    mode: 'realtime' | 'manual';
    options: {
      autoReconnect: boolean;
      maxReconnectAttempts: number;
      reconnectDelay: number;
      heartbeatInterval: number;
    };
  };
  performance: {
    batchSize: number;
    batchDelay: number;
    materializationCaching: boolean;
    compressionThreshold: number;
  };
  offline: {
    enabled: boolean;
    queueSize: number;
    persistence: boolean;
    syncOnReconnect: boolean;
  };
  state: {
    materializer?: (events: KSyncEvent[]) => any;
    enableCaching: boolean;
    autoMaterialize: boolean;
  };
  debug: {
    events: boolean;
    sync: boolean;
    performance: boolean;
    storage: boolean;
  };
  features: {
    presence: boolean;
    streaming: boolean;
    encryption: boolean;
  };
}

const log = (debug: any, category: string, ...args: any[]) => {
  if (debug === true || (typeof debug === 'object' && debug[category])) {
    console.log(`[kSync:${category}]`, ...args);
  }
};

export class KSync extends EventEmitter {
  private config: ResolvedKSyncConfig;
  private storage!: KSyncStorage;
  private syncClient?: KSyncSync;
  private events: KSyncEvent[] = [];
  private materializedState: any = null;
  private version = 0;
  private isConnected = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private messageQueue: KSyncEvent[] = [];
  private presenceMap = new Map<string, PresenceInfo>();
  private streamStates = new Map<string, any>();
  
  // Performance optimization state
  private eventBatchTimeout?: NodeJS.Timeout;
  private pendingEvents: KSyncEvent[] = [];
  private materializationCache = new Map<string, any>();
  private lastMaterializationHash = '';
  private performanceMetrics = {
    eventsProcessed: 0,
    averageProcessingTime: 0,
    materializationCount: 0,
    averageMaterializationTime: 0
  };

  constructor(config: KSyncConfig = {}) {
    super();
    
    this.config = this.resolveConfig(config);
    this.initializeStorage();
    this.initializeSync();
    this.setupOfflineHandling();
    this.setupPerformanceMonitoring();
    
    log(this.config.debug, 'events', 'KSync initialized with config:', this.config);
  }

  // === PUBLIC API ===

  /**
   * Send an event to the system
   * @param type Event type - use namespaced names like 'chat.message' for organization
   * @param data Event data - will be validated if schema is defined
   * @param options Additional options for this specific event
   */
  async send(
    type: string, 
    data: any, 
    options?: {
      priority?: 'low' | 'normal' | 'high'; // Event priority (default: 'normal')
      ttl?: number;                        // Time to live in ms
      requireSync?: boolean;               // Require successful sync before resolving
      metadata?: Record<string, any>;      // Additional metadata
    }
  ): Promise<void> {
    const startTime = performance.now();
    
    const event: KSyncEvent = {
      id: generateId(),
      type,
      data,
      timestamp: Date.now(),
      version: ++this.version,
      userId: this.config.userId,
      ...(options?.metadata && { metadata: options.metadata }),
      ...(options?.ttl && { ttl: options.ttl }),
      ...(options?.priority && { priority: options.priority })
    };

    log(this.config.debug, 'events', 'Sending event:', { type, eventId: event.id });

    // Add to local events immediately (optimistic update)
    await this.addEvent(event);
    
    // Handle sync based on configuration
    if (this.config.sync.enabled && this.syncClient) {
      if (this.isConnected && this.isOnline) {
        try {
          await this.sendToServer(event);
          log(this.config.debug, 'sync', 'Event synced successfully:', event.id);
          
          if (options?.requireSync) {
            // Event has been successfully synced
            return;
          }
        } catch (error) {
          log(this.config.debug, 'sync', 'Sync failed, queuing event:', error);
          this.queueEvent(event);
        }
      } else {
        // Queue for later sync
        this.queueEvent(event);
        log(this.config.debug, 'offline', 'Event queued for offline sync:', event.id);
      }
    }
    
    this.updatePerformanceMetrics('eventProcessing', performance.now() - startTime);
  }

  /**
   * Listen to events of a specific type
   * @param type Event type to listen for
   * @param listener Callback function that receives the event data
   * @returns Unsubscribe function
   */
  on(type: string, listener: (data: any, event?: KSyncEvent) => void): this {
    super.on(type, listener);
    return this;
  }

  /**
   * Listen to an event once
   * @param type Event type to listen for
   * @param listener Callback function
   * @returns This instance for chaining
   */
  once(type: string, listener: (data: any, event?: KSyncEvent) => void): this {
    super.once(type, listener);
    return this;
  }

  /**
   * Remove event listener
   * @param type Event type
   * @param listener Listener function to remove
   * @returns This instance for chaining
   */
  off(type: string, listener: (data: any, event?: KSyncEvent) => void): this {
    super.off(type, listener);
    return this;
  }

  /**
   * Get current materialized state
   * @param forceMaterialize Force re-materialization even if cached
   * @returns Current state or null if no materializer is configured
   */
  getState(forceMaterialize = false): any {
    if (!this.config.state.materializer) {
      log(this.config.debug, 'events', 'No materializer configured, returning raw events');
      return { events: this.events };
    }

    if (forceMaterialize || this.needsRematerialization()) {
      this.materialize();
    }
    
    return this.materializedState;
  }

  /**
   * Get all events (backward compatibility)
   */
  getEvents(): KSyncEvent[] {
    return [...this.events];
  }

  /**
   * Initialize the instance (backward compatibility)
   */
  async initialize(config?: any, syncClient?: KSyncSync): Promise<void> {
    if (syncClient) {
      this.syncClient = syncClient;
    }
    if (this.config.sync.enabled && this.config.serverUrl) {
      await this.connect();
    }
  }

  /**
   * Define a schema (backward compatibility - no-op for now)
   */
  defineSchema(name: string, schema: any): void {
    log(this.config.debug, 'events', `Schema defined: ${name}`);
    // No-op for backward compatibility
  }

  /**
   * Define a materializer (backward compatibility)
   */
  defineMaterializer(name: string, materializer: (events: KSyncEvent[]) => any): void {
    if (!this.config.state.materializer) {
      // If no materializer set, use this one
      (this.config.state as any).materializer = materializer;
    }
    log(this.config.debug, 'events', `Materializer defined: ${name}`);
  }

  /**
   * Close/cleanup (backward compatibility)
   */
  async close(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Update presence (backward compatibility)
   */
  async updatePresence(data: Partial<PresenceInfo>): Promise<void> {
    await this.setPresence(data);
  }

  /**
   * Listen to presence updates (backward compatibility)
   */
  onPresence(listener: (presence: PresenceInfo) => void): void {
    this.on('presence-update', listener);
  }

  /**
   * Get system status and metrics
   * @returns Comprehensive status information
   */
  getStatus() {
    return {
      // Connection status
      connected: this.isConnected,
      online: this.isOnline,
      serverUrl: this.config.serverUrl,
      
      // Data status  
      events: this.events.length,
      queued: this.messageQueue.length,
      version: this.version,
      
      // User context
      room: this.config.room,
      userId: this.config.userId,
      
      // Performance metrics
      performance: { ...this.performanceMetrics },
      
      // Feature status
      features: {
        syncEnabled: this.config.sync.enabled,
        offlineEnabled: this.config.offline.enabled,
        presenceEnabled: this.config.features.presence,
        streamingEnabled: this.config.features.streaming
      }
    };
  }

  /**
   * Manually trigger sync (useful for manual sync mode or troubleshooting)
   * @param options Sync options
   */
  async sync(options?: {
    force?: boolean;      // Force sync even if already connected
    timeout?: number;     // Sync timeout in ms
  }): Promise<{ synced: number; errors: number }> {
    if (!this.config.sync.enabled) {
      throw new KSyncError('Sync is disabled', 'SYNC_DISABLED');
    }

    if (!this.isOnline) {
      throw new KSyncError('Cannot sync while offline', 'OFFLINE');
    }
    
    if (!this.isConnected || options?.force) {
      await this.connect();
    }
    
    const startTime = performance.now();
    const result = await this.sendQueuedEvents();
    const duration = performance.now() - startTime;
    
    log(this.config.debug, 'sync', `Sync completed in ${duration.toFixed(2)}ms:`, result);
    
    return result;
  }

  /**
   * Join a room (for multi-room applications)
   * @param room Room name to join
   * @param options Room join options
   */
  async joinRoom(room: string, options?: {
    leaveCurrentRoom?: boolean;  // Leave current room first (default: false)
    syncHistory?: boolean;       // Sync room history (default: true)
  }): Promise<void> {
    const previousRoom = this.config.room;
    this.config.room = room;
    
    if (this.syncClient && this.isConnected) {
      if (options?.leaveCurrentRoom && previousRoom !== room) {
        await this.syncClient.send({
          type: 'leave',
          data: { room: previousRoom, userId: this.config.userId }
        });
      }
      
      await this.syncClient.send({
        type: 'join',
        data: { 
          room, 
          userId: this.config.userId,
          syncHistory: options?.syncHistory !== false
        }
      });
    }
    
    log(this.config.debug, 'sync', `Joined room: ${room}`);
    this.emit('room-changed', { from: previousRoom, to: room });
  }

  /**
   * Set user presence information
   * @param info Presence information to set
   */
  async setPresence(info: Partial<PresenceInfo>): Promise<void> {
    if (!this.config.features.presence) {
      throw new KSyncError('Presence feature is disabled', 'FEATURE_DISABLED');
    }

    const presence: PresenceInfo = {
      userId: this.config.userId,
      status: 'online',
      lastSeen: Date.now(),
      ...info
    };

    this.presenceMap.set(this.config.userId, presence);
    await this.send('presence-update', presence);
    
    log(this.config.debug, 'events', 'Presence updated:', presence);
  }

  /**
   * Get presence information for all users
   * @param filter Optional filter function
   * @returns Array of presence information
   */
  getPresence(filter?: (presence: PresenceInfo) => boolean): PresenceInfo[] {
    const allPresence = Array.from(this.presenceMap.values());
    return filter ? allPresence.filter(filter) : allPresence;
  }

  /**
   * Start a data stream (useful for AI responses, live updates, etc.)
   * @param streamId Unique stream identifier
   * @param options Stream configuration
   */
  async startStream(
    streamId: string, 
    options?: {
      type?: string;              // Stream type for filtering
      metadata?: Record<string, any>; // Additional metadata
      autoEnd?: number;           // Auto-end stream after ms
    }
  ): Promise<void> {
    if (!this.config.features.streaming) {
      throw new KSyncError('Streaming feature is disabled', 'FEATURE_DISABLED');
    }

    this.streamStates.set(streamId, { 
      active: true, 
      startTime: Date.now(),
      ...options 
    });
    
    await this.send('stream-start', { streamId, ...options });
    this.emit('stream-start', { streamId, ...options });
    
    // Auto-end stream if configured
    if (options?.autoEnd) {
      setTimeout(() => {
        if (this.streamStates.has(streamId)) {
          this.endStream(streamId);
        }
      }, options.autoEnd);
    }
    
    log(this.config.debug, 'events', 'Stream started:', streamId);
  }

  /**
   * Send data chunk to a stream
   * @param streamId Stream identifier
   * @param chunk Data chunk to send
   */
  async streamChunk(streamId: string, chunk: StreamChunk): Promise<void> {
    if (!this.streamStates.has(streamId)) {
      throw new KSyncError('Stream not found', 'STREAM_NOT_FOUND');
    }
    
         const streamData = { streamId, data: chunk.data, metadata: chunk.metadata, complete: chunk.complete };
     await this.send('stream-chunk', streamData);
     this.emit('stream-chunk', streamData);
  }

  /**
   * End a stream
   * @param streamId Stream identifier
   * @param data Optional final data
   */
  async endStream(streamId: string, data?: any): Promise<void> {
    this.streamStates.delete(streamId);
    
    const streamData = { streamId, data, endTime: Date.now() };
    await this.send('stream-end', streamData);
    this.emit('stream-end', streamData);
    
    log(this.config.debug, 'events', 'Stream ended:', streamId);
  }

  /**
   * Get all active streams
   * @returns Array of active stream IDs and their metadata
   */
  getActiveStreams(): Array<{ streamId: string; metadata: any }> {
    return Array.from(this.streamStates.entries()).map(([streamId, metadata]) => ({
      streamId,
      metadata
    }));
  }

  /**
   * Connect to the sync server (usually automatic)
   * @param options Connection options
   */
  async connect(options?: {
    timeout?: number;     // Connection timeout in ms
    force?: boolean;      // Force new connection even if already connected
  }): Promise<void> {
    if (!this.config.sync.enabled || !this.config.serverUrl) {
      throw new KSyncError('Sync is not configured', 'SYNC_NOT_CONFIGURED');
    }

    if (this.isConnected && !options?.force) {
      return;
    }

    if (!this.syncClient) {
      this.syncClient = new WebSocketSyncClient(
        this.config.serverUrl,
        this.config.sync.options.maxReconnectAttempts,
        this.config.sync.options.reconnectDelay,
        typeof this.config.debug === 'object' ? this.config.debug.sync : this.config.debug
      );
      this.setupSyncHandlers();
    }

    const startTime = performance.now();
    await this.syncClient.connect();
    const duration = performance.now() - startTime;
    
    log(this.config.debug, 'sync', `Connected in ${duration.toFixed(2)}ms`);
    
    // Auto-join room
    if (this.config.room) {
      await this.joinRoom(this.config.room);
    }
    
    // Auto-authenticate
    if (this.config.auth.token || this.config.auth.provider) {
      await this.authenticate();
    }
    
    // Send queued events
    await this.sendQueuedEvents();
  }

  /**
   * Disconnect from the sync server
   */
  async disconnect(): Promise<void> {
    if (this.syncClient) {
      await this.syncClient.disconnect();
    }
    this.isConnected = false;
    
    log(this.config.debug, 'sync', 'Disconnected from server');
    this.emit('disconnected');
  }

  /**
   * Clear all events and reset state
   * @param options Clear options
   */
  async clear(options?: {
    events?: boolean;     // Clear events (default: true)
    state?: boolean;      // Clear materialized state (default: true)
    queue?: boolean;      // Clear offline queue (default: true)
    storage?: boolean;    // Clear persistent storage (default: false)
  }): Promise<void> {
    const opts = {
      events: true,
      state: true,
      queue: true,
      storage: false,
      ...options
    };

    if (opts.events) {
      this.events = [];
      this.version = 0;
    }
    
    if (opts.state) {
      this.materializedState = null;
      this.materializationCache.clear();
    }
    
    if (opts.queue) {
      this.messageQueue = [];
    }
    
    if (opts.storage) {
      await this.storage.clear();
    }
    
    log(this.config.debug, 'events', 'Cleared data:', opts);
    this.emit('cleared', opts);
  }

  // === PRIVATE METHODS ===

  private resolveConfig(config: KSyncConfig): ResolvedKSyncConfig {
    const debugConfig = typeof config.debug === 'boolean' ? {
      events: config.debug,
      sync: config.debug,
      performance: config.debug,
      storage: config.debug
    } : {
      events: config.debug?.events || false,
      sync: config.debug?.sync || false,
      performance: config.debug?.performance || false,
      storage: config.debug?.storage || false
    };

    return {
      serverUrl: config.serverUrl || '',
      room: config.room || 'default',
      userId: config.userId || this.generateUserId(),
      clientId: config.clientId || config.userId || this.generateUserId(),
      
      auth: {
        token: config.auth?.token,
        provider: config.auth?.provider,
        type: config.auth?.type || 'bearer'
      },
      
      storage: {
        type: config.storage?.type || (typeof window !== 'undefined' ? 'indexeddb' : 'memory'),
        instance: config.storage?.instance,
        options: {
          persistEvents: config.storage?.options?.persistEvents !== false,
          maxEvents: config.storage?.options?.maxEvents || 10000,
          compression: config.storage?.options?.compression || false
        }
      },
      
      sync: {
        enabled: config.sync?.enabled !== false && !!config.serverUrl,
        client: config.sync?.client || undefined,
        mode: config.sync?.mode || 'realtime',
        options: {
          autoReconnect: config.sync?.options?.autoReconnect !== false,
          maxReconnectAttempts: config.sync?.options?.maxReconnectAttempts || 5,
          reconnectDelay: config.sync?.options?.reconnectDelay || 1000,
          heartbeatInterval: config.sync?.options?.heartbeatInterval || 30000
        }
      },
      
      performance: {
        batchSize: config.performance?.batchSize || 100,
        batchDelay: config.performance?.batchDelay || 10,
        materializationCaching: config.performance?.materializationCaching !== false,
        compressionThreshold: config.performance?.compressionThreshold || 1024
      },
      
      offline: {
        enabled: config.offline?.enabled !== false,
        queueSize: config.offline?.queueSize || 1000,
        persistence: config.offline?.persistence !== false,
        syncOnReconnect: config.offline?.syncOnReconnect !== false
      },
      
      state: {
        materializer: config.state?.materializer || undefined,
        enableCaching: config.state?.enableCaching !== false,
        autoMaterialize: config.state?.autoMaterialize || false
      },
      
      debug: debugConfig,
      
      features: {
        presence: config.features?.presence !== false,
        streaming: config.features?.streaming !== false,
        encryption: config.features?.encryption || false
      }
    };
  }

  private initializeStorage(): void {
    if (this.config.storage.instance) {
      this.storage = this.config.storage.instance;
      return;
    }

    switch (this.config.storage.type) {
      case 'memory':
        this.storage = new MemoryStorage();
        break;
      case 'indexeddb':
        this.storage = new IndexedDBStorage();
        break;
      case 'file':
        // TODO: Implement file storage
        this.storage = new MemoryStorage();
        log(this.config.debug, 'storage', 'File storage not implemented, using memory');
        break;
      default:
        this.storage = new MemoryStorage();
    }
    
    log(this.config.debug, 'storage', `Initialized ${this.config.storage.type} storage`);
  }

  private initializeSync(): void {
    if (!this.config.sync.enabled) return;

    if (this.config.sync.client) {
      this.syncClient = this.config.sync.client;
      this.setupSyncHandlers();
    }
    
    // Auto-connect if serverUrl is provided and mode is realtime
    if (this.config.serverUrl && this.config.sync.mode === 'realtime' && this.isOnline) {
      setTimeout(() => this.connect().catch(error => {
        log(this.config.debug, 'sync', 'Auto-connect failed:', error);
      }), 0);
    }
  }

  private setupOfflineHandling(): void {
    if (!this.config.offline.enabled || typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      log(this.config.debug, 'offline', 'Back online');
      
      if (this.config.offline.syncOnReconnect && this.config.sync.enabled) {
        this.connect().then(() => this.sync()).catch(error => {
          log(this.config.debug, 'sync', 'Reconnect sync failed:', error);
        });
      }
      
      this.emit('online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      log(this.config.debug, 'offline', 'Gone offline');
      this.emit('offline');
    });
  }

  private setupPerformanceMonitoring(): void {
    if (!this.config.debug.performance) return;

    // Log performance metrics every 10 seconds
    setInterval(() => {
      log(this.config.debug, 'performance', 'Metrics:', this.performanceMetrics);
    }, 10000);
  }

  private async addEvent(event: KSyncEvent): Promise<void> {
    // Add to pending batch
    this.pendingEvents.push(event);
    
    // Trigger batch processing
    if (this.pendingEvents.length >= this.config.performance.batchSize) {
      await this.flushPendingEvents();
    } else {
      this.debounceBatchFlush();
    }
  }

  private debounceBatchFlush(): void {
    if (this.eventBatchTimeout) {
      clearTimeout(this.eventBatchTimeout);
    }
    
    this.eventBatchTimeout = setTimeout(() => {
      this.flushPendingEvents();
    }, this.config.performance.batchDelay);
  }

  private async flushPendingEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return;
    
    const eventsToProcess = [...this.pendingEvents];
    this.pendingEvents = [];
    
    // Add to main events array
    this.events.push(...eventsToProcess);
    
    // Trim events if over limit
    if (this.events.length > this.config.storage.options.maxEvents) {
      const trimCount = this.events.length - this.config.storage.options.maxEvents;
      this.events = this.events.slice(trimCount);
      log(this.config.debug, 'storage', `Trimmed ${trimCount} old events`);
    }
    
    // Store in persistent storage
    if (this.config.storage.options.persistEvents) {
      try {
        await this.storage.saveEvents(eventsToProcess);
        log(this.config.debug, 'storage', `Saved ${eventsToProcess.length} events`);
      } catch (error) {
        log(this.config.debug, 'storage', 'Failed to save events:', error);
      }
    }
    
    // Emit events
    eventsToProcess.forEach(event => {
      this.emit(event.type, event.data, event);
      this.emit('event', event);
    });
    
    // Auto-materialize if enabled
    if (this.config.state.autoMaterialize && this.config.state.materializer) {
      this.materialize();
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics('eventsProcessed', eventsToProcess.length);
    
    // Invalidate materialization cache
    this.lastMaterializationHash = '';
  }

  private materialize(): void {
    if (!this.config.state.materializer) return;

    const startTime = performance.now();
    
    // Check cache first
    if (this.config.performance.materializationCaching) {
      const eventsHash = this.getEventsHash();
      if (this.materializationCache.has(eventsHash)) {
        this.materializedState = this.materializationCache.get(eventsHash);
        this.lastMaterializationHash = eventsHash;
        return;
      }
    }

    // Materialize state
    this.materializedState = this.config.state.materializer(this.events);
    const duration = performance.now() - startTime;
    
    // Cache result
    if (this.config.performance.materializationCaching) {
      const eventsHash = this.getEventsHash();
      this.materializationCache.set(eventsHash, this.materializedState);
      this.lastMaterializationHash = eventsHash;
      
      // Limit cache size
      if (this.materializationCache.size > 10) {
        const firstKey = this.materializationCache.keys().next().value;
        if (firstKey !== undefined) {
          this.materializationCache.delete(firstKey);
        }
      }
    }
    
    this.updatePerformanceMetrics('materialization', duration);
    log(this.config.debug, 'performance', `Materialized ${this.events.length} events in ${duration.toFixed(2)}ms`);
  }

  private needsRematerialization(): boolean {
    if (!this.config.performance.materializationCaching) return true;
    return this.lastMaterializationHash !== this.getEventsHash();
  }

  private getEventsHash(): string {
    return `${this.events.length}-${this.version}`;
  }

  private queueEvent(event: KSyncEvent): void {
    this.messageQueue.push(event);
    
    // Limit queue size
    if (this.messageQueue.length > this.config.offline.queueSize) {
      this.messageQueue = this.messageQueue.slice(-this.config.offline.queueSize);
      log(this.config.debug, 'offline', `Queue size limited to ${this.config.offline.queueSize} events`);
    }
  }

  private async sendQueuedEvents(): Promise<{ synced: number; errors: number }> {
    if (!this.syncClient || !this.isConnected || this.messageQueue.length === 0) {
      return { synced: 0, errors: 0 };
    }

    const events = [...this.messageQueue];
    this.messageQueue = [];
    
    let synced = 0;
    let errors = 0;

    // Send in batches for better performance
    const batches = [];
    for (let i = 0; i < events.length; i += this.config.performance.batchSize) {
      batches.push(events.slice(i, i + this.config.performance.batchSize));
    }

    for (const batch of batches) {
      try {
        await this.syncClient.send({
          type: 'event-batch',
          data: batch
        });
        synced += batch.length;
        log(this.config.debug, 'sync', `Synced batch of ${batch.length} events`);
      } catch (error) {
        errors += batch.length;
        log(this.config.debug, 'sync', 'Batch sync failed:', error);
        // Put events back at front of queue
        this.messageQueue.unshift(...batch);
        break;
      }
    }

    return { synced, errors };
  }

  private async sendToServer(event: KSyncEvent): Promise<void> {
    if (!this.syncClient) {
      throw new KSyncError('Not connected', 'NOT_CONNECTED');
    }
    
    await this.syncClient.send({
      type: 'event',
      data: event
    });
  }

  private async authenticate(): Promise<void> {
    if (!this.syncClient || !this.isConnected) return;

    let token = this.config.auth.token;
    
    if (this.config.auth.provider) {
      token = await this.config.auth.provider();
    }
    
    if (token) {
      await this.syncClient.send({
        type: 'auth',
        data: { 
          token, 
          type: this.config.auth.type,
          userId: this.config.userId 
        }
      });
      
      log(this.config.debug, 'sync', 'Authenticated successfully');
    }
  }

  private setupSyncHandlers(): void {
    if (!this.syncClient) return;

    this.syncClient.onMessage((message: WebSocketMessage) => {
      this.handleSyncMessage(message);
    });

    this.syncClient.onConnect(() => {
      this.isConnected = true;
      log(this.config.debug, 'sync', 'Connected to server');
      this.emit('connected');
    });

    this.syncClient.onDisconnect(() => {
      this.isConnected = false;
      log(this.config.debug, 'sync', 'Disconnected from server');
      this.emit('disconnected');
    });
  }

  private async handleSyncMessage(message: WebSocketMessage): Promise<void> {
    switch (message.type) {
      case 'event':
        if (message.data) {
          await this.addEvent(message.data);
        }
        break;
        
      case 'event-batch':
        if (Array.isArray(message.data)) {
          for (const event of message.data) {
            await this.addEvent(event);
          }
        }
        break;
        
      case 'sync-response':
        if (Array.isArray(message.data)) {
          for (const event of message.data) {
            await this.addEvent(event);
          }
        }
        break;
        
      case 'presence-update':
        if (message.data && this.config.features.presence) {
          this.presenceMap.set(message.data.userId, message.data);
          this.emit('presence-update', message.data);
        }
        break;
        
      case 'stream-start':
      case 'stream-chunk':
      case 'stream-end':
        if (message.data && this.config.features.streaming) {
          this.emit(message.type, message.data);
        }
        break;
        
      default:
        log(this.config.debug, 'sync', 'Unknown message type:', message.type);
    }
  }

  private updatePerformanceMetrics(type: string, value: number): void {
    switch (type) {
      case 'eventProcessing':
        this.performanceMetrics.eventsProcessed++;
        this.performanceMetrics.averageProcessingTime = 
          (this.performanceMetrics.averageProcessingTime + value) / 2;
        break;
        
      case 'materialization':
        this.performanceMetrics.materializationCount++;
        this.performanceMetrics.averageMaterializationTime = 
          (this.performanceMetrics.averageMaterializationTime + value) / 2;
        break;
        
      case 'eventsProcessed':
        this.performanceMetrics.eventsProcessed += value;
        break;
    }
  }

  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// === CONVENIENCE FACTORY FUNCTIONS ===

/**
 * Create a KSync instance with sensible defaults
 * @param config Configuration options
 * @returns KSync instance
 */
export function createKSync(config?: KSyncConfig): KSync {
  return new KSync(config);
}

/**
 * Create a KSync instance optimized for chat applications
 * @param room Chat room name
 * @param config Additional configuration
 * @returns KSync instance configured for chat
 */
export function createChat(room: string, config?: Partial<KSyncConfig>): KSync {
  return new KSync({
    room,
    features: {
      presence: true,
      streaming: false,
      ...config?.features
    },
    debug: true,
    ...config
  });
}

/**
 * Create a KSync instance optimized for todo/task applications
 * @param config Configuration options
 * @returns KSync instance configured for todos
 */
export function createTodos(config?: Partial<KSyncConfig>): KSync {
  return new KSync({
    room: 'todos',
    offline: {
      enabled: true,
      queueSize: 5000,
      persistence: true,
      ...config?.offline
    },
    storage: {
      type: 'indexeddb',
      options: {
        persistEvents: true,
        maxEvents: 50000,
        ...config?.storage?.options
      },
      ...config?.storage
    },
    debug: true,
    ...config
  });
}

/**
 * Create a KSync instance optimized for multiplayer games
 * @param gameId Game identifier
 * @param config Additional configuration
 * @returns KSync instance configured for gaming
 */
export function createGame(gameId: string, config?: Partial<KSyncConfig>): KSync {
  return new KSync({
    room: `game-${gameId}`,
    performance: {
      batchSize: 50,    // Smaller batches for lower latency
      batchDelay: 5,    // Faster batching for real-time updates
      ...config?.performance
    },
    features: {
      presence: true,
      streaming: true,
      ...config?.features
    },
    debug: true,
    ...config
  });
}

/**
 * Create a KSync instance optimized for AI applications with streaming
 * @param conversationId Conversation identifier
 * @param config Additional configuration
 * @returns KSync instance configured for AI
 */
export function createAI(conversationId?: string, config?: Partial<KSyncConfig>): KSync {
  return new KSync({
    room: conversationId || 'ai-chat',
    features: {
      streaming: true,
      presence: false,
      ...config?.features
    },
    performance: {
      batchSize: 10,    // Small batches for streaming
      batchDelay: 1,    // Very fast for AI streaming
      ...config?.performance
    },
    debug: true,
    ...config
  });
} 