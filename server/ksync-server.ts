import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { EventEmitter } from 'events';

export interface KSyncServerConfig {
  port?: number;
  auth?: {
    secret?: string;
    verify?: (token: string) => Promise<{ userId: string; [key: string]: any }>;
  };
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
  rateLimit?: {
    maxConnections?: number;
    maxEventsPerSecond?: number;
  };
  storage?: {
    type: 'memory' | 'redis' | 'file';
    config?: any;
  };
  debug?: boolean;
}

export interface KSyncClient {
  id: string;
  userId?: string;
  ws: WebSocket;
  rooms: Set<string>;
  lastPing: number;
  metadata: Record<string, any>;
}

export interface KSyncMessage {
  type: 'event' | 'join' | 'leave' | 'sync' | 'ping' | 'pong' | 'auth';
  room?: string;
  data?: any;
  messageId?: string;
  timestamp?: number;
}

export class KSyncServer extends EventEmitter {
  private wss: WebSocketServer;
  private server: Server;
  private clients = new Map<string, KSyncClient>();
  private rooms = new Map<string, Set<string>>(); // roomId -> clientIds
  private events = new Map<string, any[]>(); // roomId -> events
  private config: Required<KSyncServerConfig>;

  constructor(config: KSyncServerConfig = {}) {
    super();
    
    this.config = {
      port: 8080,
      auth: {},
      cors: { origin: '*', credentials: true },
      rateLimit: { maxConnections: 1000, maxEventsPerSecond: 100 },
      storage: { type: 'memory' },
      debug: false,
      ...config
    };

    this.server = createServer();
    this.wss = new WebSocketServer({ 
      server: this.server,
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupServer();
  }

  // 🚀 Super simple API for users
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`🚀 kSync Server running on ws://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close();
      this.server.close(() => resolve());
    });
  }

  // 📡 Broadcast to all clients in a room
  broadcast(room: string, data: any): void {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return;

    const message: KSyncMessage = {
      type: 'event',
      room,
      data,
      timestamp: Date.now()
    };

    roomClients.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });

    // Store event for sync
    if (!this.events.has(room)) {
      this.events.set(room, []);
    }
    const roomEvents = this.events.get(room);
    if (roomEvents) {
      roomEvents.push(data);
    }
  }

  // 🎯 Send to specific client
  sendToClient(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'event',
        data,
        timestamp: Date.now()
      }));
    }
  }

  // 👥 Get all clients in a room
  getRoomClients(room: string): KSyncClient[] {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return [];
    
    return Array.from(roomClients)
      .map(id => this.clients.get(id))
      .filter(Boolean) as KSyncClient[];
  }

  // 📊 Get server stats
  getStats() {
    return {
      clients: this.clients.size,
      rooms: this.rooms.size,
      events: Array.from(this.events.values()).reduce((sum, events) => sum + events.length, 0),
      uptime: process.uptime()
    };
  }

  // 🔧 Private setup methods
  private setupServer(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000);
    
    // Ping clients
    setInterval(() => this.pingClients(), 30000);
  }

  private verifyClient(info: any): boolean {
    // Basic rate limiting
    if (this.clients.size >= (this.config.rateLimit?.maxConnections || 1000)) {
      return false;
    }
    
    // CORS check
    const origin = info.origin;
    const allowedOrigins = this.config.cors.origin;
    
    if (allowedOrigins !== '*' && Array.isArray(allowedOrigins)) {
      return allowedOrigins.includes(origin);
    }
    
    return true;
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = this.generateClientId();
    const client: KSyncClient = {
      id: clientId,
      ws,
      rooms: new Set(),
      lastPing: Date.now(),
      metadata: {}
    };

    this.clients.set(clientId, client);
    this.log(`Client connected: ${clientId}`);

    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('close', () => this.handleDisconnect(client));
    ws.on('error', (error) => this.handleError(client, error));
    ws.on('pong', () => client.lastPing = Date.now());

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      serverTime: Date.now()
    });

    this.emit('client-connected', client);
  }

  private async handleMessage(client: KSyncClient, data: any): Promise<void> {
    try {
      const message: KSyncMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth':
          await this.handleAuth(client, message);
          break;
          
        case 'join':
          this.handleJoin(client, message);
          break;
          
        case 'leave':
          this.handleLeave(client, message);
          break;
          
        case 'event':
          this.handleEvent(client, message);
          break;
          
        case 'sync':
          this.handleSync(client, message);
          break;
          
        case 'ping':
          client.ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      this.log(`Error handling message from ${client.id}:`, error);
    }
  }

  private async handleAuth(client: KSyncClient, message: KSyncMessage): Promise<void> {
    if (!this.config.auth.verify) {
      client.userId = message.data?.userId || 'anonymous';
      this.sendToClient(client.id, { type: 'auth-success', userId: client.userId });
      return;
    }

    try {
      const result = await this.config.auth.verify(message.data?.token);
      client.userId = result.userId;
      client.metadata = { ...client.metadata, ...result };
      
      this.sendToClient(client.id, { 
        type: 'auth-success', 
        userId: client.userId,
        metadata: client.metadata 
      });
      
      this.emit('client-authenticated', client);
    } catch (error) {
      this.sendToClient(client.id, { 
        type: 'auth-error', 
        error: 'Authentication failed' 
      });
    }
  }

  private handleJoin(client: KSyncClient, message: KSyncMessage): void {
    const room = message.room;
    if (!room) return;

    // Add client to room
    client.rooms.add(room);
    
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(client.id);

    // Send existing events to sync client
    const roomEvents = this.events.get(room) || [];
    if (roomEvents.length > 0) {
      this.sendToClient(client.id, {
        type: 'sync',
        room,
        events: roomEvents
      });
    }

    // Notify others
    this.broadcast(room, {
      type: 'user-joined',
      clientId: client.id,
      userId: client.userId
    });

    this.log(`Client ${client.id} joined room: ${room}`);
    this.emit('client-joined-room', client, room);
  }

  private handleLeave(client: KSyncClient, message: KSyncMessage): void {
    const room = message.room;
    if (!room) return;

    this.removeClientFromRoom(client, room);
  }

  private handleEvent(client: KSyncClient, message: KSyncMessage): void {
    const room = message.room;
    if (!room || !client.rooms.has(room)) return;

    // Add metadata
    const eventData = {
      ...message.data,
      _meta: {
        clientId: client.id,
        userId: client.userId,
        timestamp: Date.now()
      }
    };

    // Broadcast to room (including sender for confirmation)
    this.broadcast(room, eventData);
    
    this.emit('event', room, eventData, client);
  }

  private handleSync(client: KSyncClient, message: KSyncMessage): void {
    const room = message.room;
    if (!room) return;

    const roomEvents = this.events.get(room) || [];
    const fromTimestamp = message.data?.fromTimestamp || 0;
    
    const eventsToSync = roomEvents.filter(event => 
      (event._meta?.timestamp || 0) > fromTimestamp
    );

    this.sendToClient(client.id, {
      type: 'sync',
      room,
      events: eventsToSync,
      timestamp: Date.now()
    });
  }

  private handleDisconnect(client: KSyncClient): void {
    // Remove from all rooms
    client.rooms.forEach(room => {
      this.removeClientFromRoom(client, room);
    });

    this.clients.delete(client.id);
    this.log(`Client disconnected: ${client.id}`);
    this.emit('client-disconnected', client);
  }

  private handleError(client: KSyncClient, error: Error): void {
    this.log(`Client error (${client.id}):`, error);
    this.emit('client-error', client, error);
  }

  private removeClientFromRoom(client: KSyncClient, room: string): void {
    client.rooms.delete(room);
    
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(client.id);
      
      // Notify others
      this.broadcast(room, {
        type: 'user-left',
        clientId: client.id,
        userId: client.userId
      });
      
      // Clean up empty rooms
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    this.emit('client-left-room', client, room);
  }

  private pingClients(): void {
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    });
  }

  private cleanup(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    this.clients.forEach(client => {
      if (now - client.lastPing > timeout) {
        client.ws.terminate();
        this.handleDisconnect(client);
      }
    });
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[kSync]', ...args);
    }
  }
}

// 🎯 Quick start helpers
export function createKSyncServer(config?: KSyncServerConfig): KSyncServer {
  return new KSyncServer(config);
}

// 🚀 One-liner server start
export async function startKSyncServer(port = 8080): Promise<KSyncServer> {
  const server = new KSyncServer({ port, debug: true });
  await server.start();
  return server;
} 