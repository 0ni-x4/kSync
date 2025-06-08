import { WebSocketServer } from 'ws'
import { z } from 'zod'
import { KSyncEvent, WebSocketMessage, PresenceState } from '../../src/types'

// Game-specific schemas
const ChatMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  author: z.string(),
  timestamp: z.number()
})

const PlayerJoinedSchema = z.object({
  playerId: z.string(),
  username: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string()
})

const PlayerMoveSchema = z.object({
  playerId: z.string(),
  x: z.number(),
  y: z.number()
})

const GameActionSchema = z.object({
  playerId: z.string(),
  action: z.string(),
  data: z.any()
})

// Server state
interface Client {
  id: string
  ws: any
  lastSeen: number
  isAlive: boolean
}

interface Player {
  id: string
  username: string
  x: number
  y: number
  color: string
  score: number
  lastSeen: number
}

interface Coin {
  id: string
  x: number
  y: number
  value: number
}

class GameServer {
  private clients = new Map<string, Client>()
  private players = new Map<string, Player>()
  private coins = new Map<string, Coin>()
  private events: KSyncEvent[] = []
  private presence: PresenceState = {}
  private version = 0

  // Efficiency settings
  private readonly MAX_EVENTS = 10000
  private readonly COIN_SPAWN_INTERVAL = 5000
  private readonly HEARTBEAT_INTERVAL = 30000
  private readonly CLIENT_TIMEOUT = 60000
  private readonly STATS_INTERVAL = 10000

  constructor(private port: number) {
    this.startCoinSpawner()
    this.startHeartbeat()
    this.startStatsLogger()
  }

  start(): void {
    const wss = new WebSocketServer({ port: this.port })
    
    console.log(`🎮 Game server starting on port ${this.port}`)

    wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId()
      
      // Prevent duplicate connections from same client
      const existingClient = Array.from(this.clients.values())
        .find(c => c.ws === ws)
      
      if (existingClient) {
        console.log(`⚠️  Duplicate connection attempt from ${clientId}`)
        ws.close()
        return
      }

      const client: Client = {
        id: clientId,
        ws,
        lastSeen: Date.now(),
        isAlive: true
      }

      this.clients.set(clientId, client)
      console.log(`🔌 Client connected: ${clientId} (${this.clients.size} total)`)

      // Set up WebSocket handlers
      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          this.handleMessage(clientId, message)
        } catch (error) {
          console.error(`❌ Invalid message from ${clientId}:`, error)
        }
      })

      ws.on('close', () => {
        this.handleDisconnect(clientId)
      })

      ws.on('error', (error: Error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error)
        this.handleDisconnect(clientId)
      })

      // Handle pong responses
      ws.on('pong', () => {
        const client = this.clients.get(clientId)
        if (client) {
          client.isAlive = true
          client.lastSeen = Date.now()
        }
      })
    })

    console.log(`✅ Game server running on ws://localhost:${this.port}`)
  }

  private handleMessage(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId)
    if (!client) return

    client.lastSeen = Date.now()

    switch (message.type) {
      case 'event':
        this.handleEvent(clientId, message.data)
        break
      case 'sync-request':
        this.handleSyncRequest(clientId, message.data?.fromVersion || 0)
        break
      case 'presence-update':
        this.handlePresenceUpdate(clientId, message.data)
        break
      case 'ping':
        this.send(clientId, { type: 'pong' })
        break
      case 'pong':
        client.isAlive = true
        break
    }
  }

  private handleEvent(clientId: string, eventData: KSyncEvent): void {
    // Validate event based on type
    try {
      switch (eventData.type) {
        case 'chat-message':
          ChatMessageSchema.parse(eventData.data)
          break
        case 'player-joined':
          PlayerJoinedSchema.parse(eventData.data)
          this.handlePlayerJoined(eventData.data)
          break
        case 'player-move':
          PlayerMoveSchema.parse(eventData.data)
          this.handlePlayerMove(eventData.data)
          break
        case 'game-action':
          GameActionSchema.parse(eventData.data)
          this.handleGameAction(eventData.data)
          break
      }
    } catch (error) {
      console.error(`❌ Invalid event data for ${eventData.type}:`, error)
      return
    }

    // Set version and store event
    const event: KSyncEvent = {
      ...eventData,
      version: ++this.version,
      timestamp: Date.now()
    }

    this.events.push(event)
    
    // Trim events if too many
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS)
    }

    // Broadcast to all clients except sender (to avoid echo)
    this.broadcast(event, clientId)
  }

  private handlePlayerJoined(data: any): void {
    const player: Player = {
      id: data.playerId,
      username: data.username,
      x: data.x,
      y: data.y,
      color: data.color,
      score: 0,
      lastSeen: Date.now()
    }
    
    this.players.set(data.playerId, player)
  }

  private handlePlayerMove(data: any): void {
    const player = this.players.get(data.playerId)
    if (player) {
      player.x = data.x
      player.y = data.y
      player.lastSeen = Date.now()
    }
  }

  private handleGameAction(data: any): void {
    if (data.action === 'collect-coin') {
      const coin = this.coins.get(data.data.coinId)
      const player = this.players.get(data.playerId)
      
      if (coin && player) {
        player.score += coin.value
        this.coins.delete(data.data.coinId)
        
        // Broadcast coin collection
        const event: KSyncEvent = {
          id: this.generateId(),
          type: 'game-state-update',
          data: {
            type: 'coin-collected',
            coinId: coin.id,
            playerId: player.id,
            newScore: player.score
          },
          timestamp: Date.now(),
          clientId: 'server',
          version: ++this.version
        }
        
        this.events.push(event)
        this.broadcast(event)
      }
    }
  }

  private handleSyncRequest(clientId: string, fromVersion: number): void {
    const eventsToSync = this.events.filter(e => e.version > fromVersion)
    
    this.send(clientId, {
      type: 'sync-response',
      data: eventsToSync
    })
    
    console.log(`🔄 Sync: sent ${eventsToSync.length} events to ${clientId}`)
  }

  private handlePresenceUpdate(clientId: string, data: any): void {
    this.presence[clientId] = {
      username: data.username,
      lastSeen: Date.now(),
      data: data.data || {}
    }

    // Broadcast presence update
    this.broadcast({
      type: 'presence-update',
      data: this.presence
    })
  }

  private handleDisconnect(clientId: string): void {
    this.clients.delete(clientId)
    delete this.presence[clientId]
    
    // Remove player if exists
    const player = Array.from(this.players.values())
      .find(p => p.id === clientId)
    
    if (player) {
      this.players.delete(player.id)
    }
    
    console.log(`🔌 Client disconnected: ${clientId} (${this.clients.size} total)`)
  }

  private send(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN
      try {
        client.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error(`❌ Failed to send to ${clientId}:`, error)
        this.handleDisconnect(clientId)
      }
    }
  }

  private broadcast(message: WebSocketMessage | KSyncEvent, excludeClientId?: string): void {
    const messageToSend = 'version' in message 
      ? { type: 'event' as const, data: message }
      : message

    Array.from(this.clients.entries()).forEach(([clientId, client]) => {
      if (clientId !== excludeClientId) {
        this.send(clientId, messageToSend)
      }
    })
  }

  private startCoinSpawner(): void {
    setInterval(() => {
      if (this.coins.size < 10) { // Max 10 coins
        const coin: Coin = {
          id: this.generateId(),
          x: Math.random() * 800,
          y: Math.random() * 600,
          value: Math.floor(Math.random() * 10) + 1
        }
        
        this.coins.set(coin.id, coin)
        
        const event: KSyncEvent = {
          id: this.generateId(),
          type: 'coin-spawned',
          data: coin,
          timestamp: Date.now(),
          clientId: 'server',
          version: ++this.version
        }
        
        this.events.push(event)
        this.broadcast(event)
      }
    }, this.COIN_SPAWN_INTERVAL)
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const now = Date.now()
      
      Array.from(this.clients.entries()).forEach(([clientId, client]) => {
        if (!client.isAlive || (now - client.lastSeen) > this.CLIENT_TIMEOUT) {
          console.log(`💔 Client ${clientId} timed out`)
          client.ws.terminate()
          this.handleDisconnect(clientId)
        } else {
          client.isAlive = false
          client.ws.ping()
        }
      })
      
      // Clean up old players
      Array.from(this.players.entries()).forEach(([playerId, player]) => {
        if ((now - player.lastSeen) > this.CLIENT_TIMEOUT) {
          this.players.delete(playerId)
        }
      })
    }, this.HEARTBEAT_INTERVAL)
  }

  private startStatsLogger(): void {
    setInterval(() => {
      console.log(`📊 Stats: ${this.clients.size} clients, ${this.players.size} players, ${this.events.length} events, v${this.version}`)
    }, this.STATS_INTERVAL)
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// Start the server
const server = new GameServer(8081)
server.start() 