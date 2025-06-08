import { z } from 'zod'

export interface KSyncEvent<T = any> {
  id: string
  type: string
  data: T
  timestamp: number
  clientId: string
  version: number
}

interface WebSocketMessage {
  type: 'event' | 'sync-request' | 'sync-response' | 'ping' | 'pong'
  data?: any
}

export interface KSyncConfig {
  serverUrl?: string
  clientId?: string
  debug?: boolean
}

export class KSyncClient {
  private ws: WebSocket | null = null
  private clientId: string
  private events: KSyncEvent[] = []
  private schemas: Map<string, z.ZodSchema> = new Map()
  private listeners: Map<string, ((event: KSyncEvent) => void)[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false
  private debug = false

  constructor(private config: KSyncConfig = {}) {
    this.clientId = config.clientId || this.generateClientId()
    this.debug = config.debug || false
  }

  async initialize(): Promise<void> {
    if (this.config.serverUrl) {
      await this.connect()
    }
  }

  private async connect(): Promise<void> {
    if (!this.config.serverUrl) return

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl!)
        
        this.ws.onopen = () => {
          this.isConnected = true
          this.reconnectAttempts = 0
          this.log('Connected to server')
          
          // Request sync
          this.sendMessage({
            type: 'sync-request',
            data: { fromVersion: this.getLastVersion() }
          })
          
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Error parsing message:', error)
          }
        }

        this.ws.onclose = () => {
          this.isConnected = false
          this.log('Disconnected from server')
          this.scheduleReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

      } catch (error) {
        console.error('Failed to connect:', error)
        reject(error)
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      
      this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
      
      setTimeout(() => {
        this.connect()
      }, delay)
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'event':
        this.handleEvent(message.data)
        break

      case 'sync-response':
        this.handleSyncResponse(message.data)
        break

      case 'ping':
        this.sendMessage({ type: 'pong' })
        break
    }
  }

  private handleEvent(event: KSyncEvent): void {
    // Validate event against schema
    const schema = this.schemas.get(event.type)
    if (schema) {
      try {
        schema.parse(event.data)
      } catch (error) {
        console.error(`Schema validation failed for ${event.type}:`, error)
        return
      }
    }

    // Store event
    this.events.push(event)
    
    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000)
    }

    // Notify listeners
    const eventListeners = this.listeners.get(event.type) || []
    eventListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })

    this.log(`Received event: ${event.type}`)
  }

  private handleSyncResponse(events: KSyncEvent[]): void {
    events.forEach(event => this.handleEvent(event))
    this.log(`Synced ${events.length} events`)
  }

  private sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  defineSchema(type: string, schema: z.ZodSchema): void {
    this.schemas.set(type, schema)
  }

  async send(type: string, data: any): Promise<void> {
    // Validate against schema
    const schema = this.schemas.get(type)
    if (schema) {
      try {
        schema.parse(data)
      } catch (error) {
        console.error(`Schema validation failed for ${type}:`, error)
        throw error
      }
    }

    const event: KSyncEvent = {
      id: this.generateId(),
      type,
      data,
      timestamp: Date.now(),
      clientId: this.clientId,
      version: 0, // Will be set by server
    }

    // Store locally first
    this.events.push(event)

    // Send to server if connected
    if (this.isConnected) {
      this.sendMessage({
        type: 'event',
        data: event
      })
    }

    // Notify local listeners immediately
    const eventListeners = this.listeners.get(type) || []
    eventListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })

    this.log(`Sent event: ${type}`)
  }

  on(type: string, listener: (event: KSyncEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type)!.push(listener)
  }

  off(type: string, listener: (event: KSyncEvent) => void): void {
    const listeners = this.listeners.get(type)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  getEvents(fromVersion?: number): KSyncEvent[] {
    if (fromVersion !== undefined) {
      return this.events.filter(event => event.version > fromVersion)
    }
    return [...this.events]
  }

  private getLastVersion(): number {
    if (this.events.length === 0) return 0
    return Math.max(...this.events.map(e => e.version))
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[kSync] ${message}`)
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

export function createKSync(config: KSyncConfig = {}): KSyncClient {
  return new KSyncClient(config)
} 