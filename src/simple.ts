// 🚀 Simple kSync - The easiest way to add real-time sync to your app

export interface SimpleKSyncConfig {
  serverUrl?: string;
  userId?: string;
  auth?: string | (() => Promise<string>);
  room?: string;
  offlineStorage?: boolean;
  debug?: boolean;
  suppressExpectedErrors?: boolean;
}

export interface SimpleMessage {
  id?: string;
  type: string;
  data: any;
  userId?: string;
  timestamp?: number;
}

// 🎯 One-liner to get started
export function createKSync(config: SimpleKSyncConfig = {}) {
  return new SimpleKSync(config);
}

export class SimpleKSync {
  private ws?: WebSocket;
  private config: Required<SimpleKSyncConfig>;
  private isConnected = false;
  private isConnecting = false; // Added to prevent multiple concurrent connections
  private isOnline = navigator?.onLine ?? true;
  private messageQueue: SimpleMessage[] = [];
  private listeners = new Map<string, Function[]>();
  private offlineStorage = new Map<string, any>();
  private reconnectTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  
  // Connection failure tracking
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;

  constructor(config: SimpleKSyncConfig) {
    this.config = {
      serverUrl: 'ws://localhost:8080',
      userId: `user-${Math.random().toString(36).slice(2)}`,
      auth: '',
      room: 'default',
      offlineStorage: true,
      debug: false,
      suppressExpectedErrors: false,
      ...config
    };

    this.setupOfflineHandling();
    this.loadOfflineData();
    
    if (this.config.serverUrl) {
      // Handle connection promise to prevent unhandled rejection
      this.connect().catch(error => {
        let errorMessage: string;
        if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
          errorMessage = `Auto-connect failed: ${error.type} - ${error.message || 'Connection failed'}`;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = `Auto-connect failed: ${error.message}`;
        } else {
          errorMessage = `Auto-connect failed: ${error}`;
        }
        
        // Only log if not suppressing expected errors or if debug is enabled
        if (!this.config.suppressExpectedErrors || this.config.debug) {
          this.log('❌', errorMessage);
        }
        // Don't throw here - let the user handle connection manually if needed
      });
    }
  }

  // 📡 Send a message (works offline!)
  async send(type: string, data: any): Promise<void> {
    const message: SimpleMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      data,
      userId: this.config.userId,
      timestamp: Date.now()
    };

    // Always emit locally first (optimistic update)
    this.emit(type, { ...message.data, _optimistic: true });

    if (this.isConnected && this.isOnline) {
      // Send immediately if online
      try {
        await this.sendMessage(message);
        this.log('✅ Sent:', message);
      } catch (error) {
        this.log('❌ Send failed, queuing:', error);
        this.queueMessage(message);
      }
    } else {
      // Queue for later if offline
      this.queueMessage(message);
      this.log('📦 Queued for later:', message);
    }

    // Store in offline storage
    if (this.config.offlineStorage) {
      this.storeOffline(message);
    }
  }

  // 👂 Listen to events
  on(type: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(type);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // 📊 Get sync status
  getStatus() {
    return {
      connected: this.isConnected,
      online: this.isOnline,
      queuedMessages: this.messageQueue.length,
      room: this.config.room,
      userId: this.config.userId
    };
  }

  // 🔄 Manual sync (useful for pull-to-refresh)
  async sync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot sync while offline');
    }

    if (!this.isConnected) {
      await this.connect();
    }

    await this.sendQueuedMessages();
    this.log('✅ Sync completed');
  }

  // 💾 Get offline data
  getOfflineData(): Map<string, any> {
    return new Map(this.offlineStorage);
  }

  // 🔌 Connection management
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting || !this.config.serverUrl) return;

    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) exceeded`);
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);
        
        this.ws.onopen = async () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0; // Reset on successful connection
          this.consecutiveFailures = 0; // Reset failure count
          this.log('🚀 Connected to server');

          // Join room
          await this.sendMessage({
            type: 'join',
            data: { room: this.config.room, userId: this.config.userId }
          });

          // Authenticate if needed
          if (this.config.auth) {
            const token = typeof this.config.auth === 'function' 
              ? await this.config.auth() 
              : this.config.auth;
            
            await this.sendMessage({
              type: 'auth',
              data: { token }
            });
          }

          // Send queued messages
          await this.sendQueuedMessages();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            this.log('❌ Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.isConnecting = false;
          this.log('🔌 Disconnected from server');
          
          // Only schedule reconnect if we haven't exceeded limits
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            this.log('🛑 Max reconnection attempts reached, giving up');
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          this.consecutiveFailures++;
          
          // Better error logging - works in both browser and Node.js
          let errorMessage: string;
          if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
            errorMessage = `WebSocket ${error.type}: ${error.message || 'Connection failed'}`;
          } else if (error && typeof error === 'object' && 'type' in error) {
            errorMessage = `WebSocket ${(error as any).type}: Connection failed`;
          } else {
            errorMessage = `WebSocket error: Connection failed`;
          }
          
          // Only log if not suppressing expected errors or if debug is enabled
          if (!this.config.suppressExpectedErrors || this.config.debug) {
            this.log('❌', errorMessage);
          }
          
          if (!this.isConnected) {
            reject(error);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        this.consecutiveFailures++;
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
  }

  // 🔧 Private methods
  private async sendMessage(message: Partial<SimpleMessage>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const fullMessage = {
      type: 'event',
      room: this.config.room,
      data: message,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(fullMessage));
  }

  private handleMessage(message: any): void {
    if (message.type === 'event' && message.data) {
      // Remove optimistic update flag and emit
      const { _optimistic, ...data } = message.data;
      this.emit(message.data.type, data);
    } else if (message.type === 'sync' && message.events) {
      // Handle bulk sync
      message.events.forEach((event: any) => {
        this.emit(event.type, event.data);
      });
    }
  }

  private emit(type: string, data: any): void {
    const callbacks = this.listeners.get(type) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.log('❌ Listener error:', error);
      }
    });
  }

  private queueMessage(message: SimpleMessage): void {
    this.messageQueue.push(message);
    
    // Limit queue size
    if (this.messageQueue.length > 1000) {
      this.messageQueue = this.messageQueue.slice(-1000);
    }
  }

  private async sendQueuedMessages(): Promise<void> {
    if (!this.isConnected || this.messageQueue.length === 0) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      try {
        await this.sendMessage(message);
        this.log('✅ Sent queued message:', message);
      } catch (error) {
        this.log('❌ Failed to send queued message:', error);
        this.messageQueue.unshift(message); // Put back at front
        break;
      }
    }
  }

  private setupOfflineHandling(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.log('🌐 Back online!');
        this.connect().then(() => this.sync()).catch(console.error);
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.log('📱 Gone offline');
      });

      // Periodic sync when online
      this.syncTimer = setInterval(() => {
        if (this.isOnline && this.messageQueue.length > 0) {
          this.sync().catch(() => {}); // Silent retry
        }
      }, 30000); // Every 30 seconds
    }
  }

  private scheduleReconnect(): void {
    // Don't schedule if we're already trying to reconnect or have exceeded limits
    if (this.reconnectTimer || !this.isOnline || 
        this.reconnectAttempts >= this.maxReconnectAttempts ||
        this.consecutiveFailures >= this.maxConsecutiveFailures) {
      return;
    }

    this.reconnectAttempts++;
    
    // Exponential backoff with maximum delay
    const baseDelay = 3000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    this.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      
      if (this.isOnline && !this.isConnected && !this.isConnecting) {
        this.log('🔄 Attempting to reconnect...');
        
        try {
          await this.connect();
          this.log('✅ Reconnection successful!');
        } catch (error) {
          this.log(`❌ Reconnection failed: ${error}`);
          
          // 🔥 FIXED: No more infinite recursion!
          // The onclose handler will decide whether to schedule another attempt
          // based on the reconnectAttempts counter
        }
      }
    }, delay);
  }

  private storeOffline(message: SimpleMessage): void {
    if (!this.config.offlineStorage) return;
    
    const key = `${message.type}-${message.id}`;
    this.offlineStorage.set(key, message);

    // Persist to localStorage if available
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('ksync-offline') || '{}';
        const data = JSON.parse(stored);
        data[key] = message;
        localStorage.setItem('ksync-offline', JSON.stringify(data));
      } catch (error) {
        this.log('❌ Failed to persist offline:', error);
      }
    }
  }

  private loadOfflineData(): void {
    if (!this.config.offlineStorage || typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem('ksync-offline');
      if (stored) {
        const data = JSON.parse(stored);
        Object.entries(data).forEach(([key, message]) => {
          this.offlineStorage.set(key, message);
        });
        this.log('📱 Loaded offline data:', this.offlineStorage.size, 'items');
      }
    } catch (error) {
      this.log('❌ Failed to load offline data:', error);
    }
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[kSync]', ...args);
    }
  }
}

// 🎯 Quick helpers for common patterns
export function useSimpleKSync(config: SimpleKSyncConfig) {
  return createKSync(config);
}

export function createChatApp(room = 'chat') {
  return createKSync({ room, debug: true });
}

export function createTodoApp(userId?: string) {
  return createKSync({ 
    room: 'todos', 
    userId,
    offlineStorage: true,
    debug: true 
  });
}

export function createGameApp(gameId: string, userId: string) {
  return createKSync({ 
    room: `game-${gameId}`, 
    userId,
    debug: true 
  });
} 