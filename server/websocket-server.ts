import { WebSocketServer, WebSocket } from 'ws';
import type { KSyncEvent } from '../src/types';

interface WebSocketMessage {
  type: 'event' | 'sync-request' | 'sync-response' | 'ping' | 'pong';
  data?: any;
}

interface Client {
  ws: WebSocket;
  id: string;
  lastSeen: number;
}

export class KSyncServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private events: KSyncEvent[] = [];
  private currentVersion = 0;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(private port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    this.startHeartbeat();
  }

  private setupServer(): void {
    console.log(`kSync server starting on port ${this.port}`);

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: Client = {
        ws,
        id: clientId,
        lastSeen: Date.now()
      };

      this.clients.set(clientId, client);
      console.log(`Client connected: ${clientId}`);

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleMessage(client, message);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`Client error (${clientId}):`, error);
        this.clients.delete(clientId);
      });

      // Send initial sync
      this.sendSyncResponse(client, 0);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private async handleMessage(client: Client, message: WebSocketMessage): Promise<void> {
    client.lastSeen = Date.now();

    switch (message.type) {
      case 'event':
        await this.handleEvent(client, message.data);
        break;

      case 'sync-request':
        await this.handleSyncRequest(client, message.data);
        break;

      case 'pong':
        // Client is alive
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async handleEvent(sender: Client, event: KSyncEvent): Promise<void> {
    // Assign server version
    event.version = ++this.currentVersion;
    
    // Store event
    this.events.push(event);
    
    // Keep only last 10000 events to prevent memory issues
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }

    console.log(`Event received: ${event.type} from ${sender.id}`);

    // Broadcast to all other clients
    const message: WebSocketMessage = {
      type: 'event',
      data: event
    };

    this.broadcast(JSON.stringify(message), sender.id);
  }

  private async handleSyncRequest(client: Client, data: { fromVersion: number }): Promise<void> {
    console.log(`Sync request from ${client.id}, fromVersion: ${data.fromVersion}`);
    this.sendSyncResponse(client, data.fromVersion);
  }

  private sendSyncResponse(client: Client, fromVersion: number): void {
    const eventsToSync = this.events.filter(event => event.version > fromVersion);
    
    if (eventsToSync.length > 0) {
      const message: WebSocketMessage = {
        type: 'sync-response',
        data: eventsToSync
      };

      client.ws.send(JSON.stringify(message));
      console.log(`Sent ${eventsToSync.length} events to ${client.id}`);
    }
  }

  private broadcast(message: string, excludeClientId?: string): void {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const pingMessage: WebSocketMessage = { type: 'ping' };
      const pingData = JSON.stringify(pingMessage);

      this.clients.forEach((client, clientId) => {
        // Remove stale clients (no pong for 30 seconds)
        if (now - client.lastSeen > 30000) {
          console.log(`Removing stale client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(pingData);
        }
      });
    }, 10000); // Every 10 seconds
  }

  private generateClientId(): string {
    return `server-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      totalEvents: this.events.length,
      currentVersion: this.currentVersion
    };
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
    console.log('kSync server closed');
  }
}

// CLI usage
if (require.main === module) {
  const port = parseInt(process.env.PORT || '8080');
  const server = new KSyncServer(port);

  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close();
    process.exit(0);
  });

  // Log stats every 30 seconds
  setInterval(() => {
    const stats = server.getStats();
    console.log(`Stats: ${stats.connectedClients} clients, ${stats.totalEvents} events, version ${stats.currentVersion}`);
  }, 30000);
} 