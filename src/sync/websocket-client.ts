import { KSyncSync, WebSocketMessage, KSyncError } from '../types.js'

export class WebSocketSyncClient implements KSyncSync {
  private ws?: WebSocket
  private isConnecting = false
  private reconnectAttempts = 0
  private reconnectTimeout?: NodeJS.Timeout
  private pingInterval?: NodeJS.Timeout
  
  private messageHandlers: ((message: WebSocketMessage) => void)[] = []
  private connectHandlers: (() => void)[] = []
  private disconnectHandlers: (() => void)[] = []

  constructor(
    private serverUrl: string,
    private maxReconnectAttempts = 5,
    private reconnectDelay = 1000,
    private debug = false
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected() || this.isConnecting) {
      return
    }

    this.isConnecting = true
    
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        this.isConnecting = false
        if (this.ws) {
          this.ws.close()
        }
        reject(new KSyncError('Connection timeout', 'CONNECTION_TIMEOUT'))
      }, 3000) // 3 second timeout for faster test feedback

      try {
        this.ws = new WebSocket(this.serverUrl)
        
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.startPing()
          this.log('Connected to server')
          this.connectHandlers.forEach(handler => handler())
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.messageHandlers.forEach(handler => handler(message))
          } catch (error) {
            this.log(`Failed to parse message: ${error}`)
          }
        }

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.stopPing()
          this.log('Disconnected from server')
          this.disconnectHandlers.forEach(handler => handler())
          
          // Only schedule reconnect if this wasn't the initial connection attempt
          if (this.reconnectAttempts > 0) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.log(`WebSocket error: ${error}`)
          
          // Always reject on the first connection attempt error
          if (this.reconnectAttempts === 0) {
            reject(new KSyncError('Failed to connect', 'CONNECTION_ERROR'))
          }
        }
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        reject(new KSyncError('Failed to create WebSocket', 'CONNECTION_ERROR'))
      }
    })
  }

  async disconnect(): Promise<void> {
    this.stopPing()
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }
  }

  async send(message: WebSocketMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new KSyncError('Not connected', 'NOT_CONNECTED')
    }

    try {
      this.ws!.send(JSON.stringify(message))
    } catch (error) {
      throw new KSyncError('Failed to send message', 'SEND_ERROR')
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  onMessage(callback: (message: WebSocketMessage) => void): void {
    this.messageHandlers.push(callback)
  }

  onConnect(callback: () => void): void {
    this.connectHandlers.push(callback)
  }

  onDisconnect(callback: () => void): void {
    this.disconnectHandlers.push(callback)
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        this.log(`Reconnect failed: ${error}`)
      })
    }, delay)
  }

  private startPing(): void {
    this.pingInterval = setInterval(async () => {
      if (this.isConnected()) {
        try {
          await this.send({ type: 'ping' })
        } catch (error) {
          this.log(`Ping failed: ${error}`)
        }
      }
    }, 30000) // Ping every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = undefined
    }
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[WebSocketSync] ${message}`)
    }
  }


} 