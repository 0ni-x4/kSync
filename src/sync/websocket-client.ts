import { KSyncSync, WebSocketMessage, KSyncError } from '../types.js'

export interface ConnectionHealthMetrics {
  connectionsAttempted: number;
  connectionsSuccessful: number;
  disconnections: number;
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number;
  lastPingTime?: number;
  lastPongTime?: number;
}

export interface RateLimitConfig {
  maxMessagesPerSecond: number;
  maxBurstSize: number;
  penaltyDelayMs: number;
}

export class WebSocketSyncClient implements KSyncSync {
  private ws?: WebSocket
  private isConnecting = false
  private reconnectAttempts = 0
  private reconnectTimeout?: NodeJS.Timeout
  private pingInterval?: NodeJS.Timeout
  private healthCheckInterval?: NodeJS.Timeout
  
  // Circuit breaker state
  private isCircuitBreakerOpen = false
  private circuitBreakerOpenTime?: number
  private readonly circuitBreakerTimeout = 60000 // 1 minute
  private consecutiveFailures = 0
  private readonly maxConsecutiveFailures = 5
  
  private messageHandlers: ((message: WebSocketMessage) => void)[] = []
  private connectHandlers: (() => void)[] = []
  private disconnectHandlers: (() => void)[] = []
  
  // Connection health and monitoring
  private healthMetrics: ConnectionHealthMetrics = {
    connectionsAttempted: 0,
    connectionsSuccessful: 0,
    disconnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    averageLatency: 0
  };
  
  // Rate limiting
  private rateLimitConfig: RateLimitConfig = {
    maxMessagesPerSecond: 100,
    maxBurstSize: 20,
    penaltyDelayMs: 1000
  };
  private messageTimestamps: number[] = [];
  private isRateLimited = false;

  constructor(
    private serverUrl: string,
    private maxReconnectAttempts = 10,    // Increased from 5
    private reconnectDelay = 1000,
    private debug = false,
    rateLimitConfig?: Partial<RateLimitConfig>
  ) {
    if (rateLimitConfig) {
      this.rateLimitConfig = { ...this.rateLimitConfig, ...rateLimitConfig };
    }
  }

  async connect(): Promise<void> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen) {
      if (this.circuitBreakerOpenTime && 
          Date.now() - this.circuitBreakerOpenTime < this.circuitBreakerTimeout) {
        throw new KSyncError('Circuit breaker is open - too many failures', 'CIRCUIT_BREAKER_OPEN')
      } else {
        // Reset circuit breaker after timeout
        this.resetCircuitBreaker()
      }
    }

    if (this.isConnected() || this.isConnecting) {
      return
    }

    this.isConnecting = true
    this.healthMetrics.connectionsAttempted++;
    
    return new Promise((resolve, reject) => {
      // Use exponential backoff for timeout based on attempt number
      const baseTimeout = 3000;
      const maxTimeout = 30000;
      const timeoutMs = Math.min(baseTimeout * Math.pow(2, this.reconnectAttempts), maxTimeout);
      
      const connectionTimeout = setTimeout(() => {
        this.isConnecting = false
        if (this.ws) {
          this.ws.close()
        }
        this.handleConnectionFailure()
        reject(new KSyncError(`Connection timeout after ${timeoutMs}ms`, 'CONNECTION_TIMEOUT'))
      }, timeoutMs)

      try {
        this.ws = new WebSocket(this.serverUrl)
        
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.consecutiveFailures = 0 // Reset failure count on success
          this.healthMetrics.connectionsSuccessful++;
          this.startHealthMonitoring()
          this.log('Connected to server')
          this.connectHandlers.forEach(handler => handler())
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.healthMetrics.messagesReceived++;
          
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            
            // Handle pong for latency measurement
            if (message.type === 'pong' && this.healthMetrics.lastPingTime) {
              const latency = Date.now() - this.healthMetrics.lastPingTime;
              this.healthMetrics.averageLatency = 
                (this.healthMetrics.averageLatency + latency) / 2;
              this.healthMetrics.lastPongTime = Date.now();
              return;
            }
            
            this.messageHandlers.forEach(handler => handler(message))
          } catch (error) {
            this.log(`Failed to parse message: ${error}`)
          }
        }

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.stopHealthMonitoring()
          this.healthMetrics.disconnections++;
          
          this.log(`Disconnected from server: ${event.code} - ${event.reason}`)
          this.disconnectHandlers.forEach(handler => handler())
          
          // Only schedule reconnect if we've had successful connections before
          // AND we haven't hit the reconnect limit
          if (this.healthMetrics.connectionsSuccessful > 0 && 
              this.reconnectAttempts < this.maxReconnectAttempts &&
              !this.isCircuitBreakerOpen) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.log(`WebSocket error: ${error}`)
          
          this.handleConnectionFailure()
          
          // Always reject on the first connection attempt error
          if (this.reconnectAttempts === 0) {
            reject(new KSyncError('Failed to connect', 'CONNECTION_ERROR'))
          }
        }
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        this.handleConnectionFailure()
        reject(new KSyncError('Failed to create WebSocket', 'CONNECTION_ERROR'))
      }
    })
  }

  async disconnect(): Promise<void> {
    this.stopHealthMonitoring()
    
    // Clear all timers and reset state
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }
    
    // Reset connection state
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.resetCircuitBreaker()
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect') // Normal closure
      this.ws = undefined
    }
    
    this.log('Disconnected and cleaned up all resources')
  }

  async send(message: WebSocketMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new KSyncError('Not connected', 'NOT_CONNECTED')
    }

    // Apply rate limiting
    if (this.isRateLimited) {
      throw new KSyncError('Rate limited', 'RATE_LIMITED')
    }
    
    if (!this.checkRateLimit()) {
      this.isRateLimited = true;
      setTimeout(() => {
        this.isRateLimited = false;
      }, this.rateLimitConfig.penaltyDelayMs);
      throw new KSyncError('Rate limit exceeded', 'RATE_LIMITED')
    }

    try {
      this.ws!.send(JSON.stringify(message))
      this.healthMetrics.messagesSent++;
      this.recordMessageTimestamp();
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
  
  // Get connection health metrics
  getHealthMetrics(): ConnectionHealthMetrics {
    return { ...this.healthMetrics };
  }
  
  // Get detailed connection status
  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      rateLimited: this.isRateLimited,
      health: this.getHealthMetrics(),
      readyState: this.ws?.readyState,
      url: this.serverUrl
    };
  }

  private scheduleReconnect(): void {
    // Check if we should stop reconnecting
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached')
      this.openCircuitBreaker()
      return
    }

    // Check if circuit breaker is open
    if (this.isCircuitBreakerOpen) {
      this.log('Circuit breaker is open, not scheduling reconnect')
      return
    }

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectAttempts++
    
    // Exponential backoff with jitter
    const baseDelay = this.reconnectDelay;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    const maxDelay = 30000; // Cap at 30 seconds
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = Math.min(exponentialDelay, maxDelay) + jitter;
    
    this.log(`Reconnecting in ${delay.toFixed(0)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = undefined
      
      try {
        await this.connect()
        this.log('Reconnect successful')
      } catch (error) {
        this.log(`Reconnect failed: ${error}`)
        
        // 🔥 FIXED: No more infinite recursion!
        // Instead of calling scheduleReconnect() again, we let the onclose handler
        // decide whether to schedule another attempt based on connection state
        
        // If we've exhausted all attempts, open the circuit breaker
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.openCircuitBreaker()
        }
      }
    }, delay)
  }

  private handleConnectionFailure(): void {
    this.consecutiveFailures++
    
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.openCircuitBreaker()
    }
  }

  private openCircuitBreaker(): void {
    this.isCircuitBreakerOpen = true
    this.circuitBreakerOpenTime = Date.now()
    this.log('Circuit breaker opened due to repeated failures')
  }

  private resetCircuitBreaker(): void {
    this.isCircuitBreakerOpen = false
    this.circuitBreakerOpenTime = undefined
    this.consecutiveFailures = 0
    this.reconnectAttempts = 0
    this.log('Circuit breaker reset')
  }

  private startHealthMonitoring(): void {
    // Start ping/pong for connection health
    this.pingInterval = setInterval(async () => {
      if (this.isConnected()) {
        try {
          this.healthMetrics.lastPingTime = Date.now();
          // Send a ping message through the protocol
          await this.send({ type: 'ping' });
        } catch (error) {
          this.log(`Ping failed: ${error}`)
        }
      }
    }, 30000) // Ping every 30 seconds
    
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      if (this.debug) {
        this.log(`Health metrics: ${JSON.stringify(this.healthMetrics)}`);
      }
    }, 60000); // Log health every minute in debug mode
  }

  private stopHealthMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = undefined
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }
  
  private checkRateLimit(): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Remove old timestamps
    this.messageTimestamps = this.messageTimestamps.filter(ts => ts > oneSecondAgo);
    
    // Check if we're under the rate limit
    return this.messageTimestamps.length < this.rateLimitConfig.maxMessagesPerSecond;
  }
  
  private recordMessageTimestamp(): void {
    this.messageTimestamps.push(Date.now());
    
    // Keep only recent timestamps for burst checking
    if (this.messageTimestamps.length > this.rateLimitConfig.maxBurstSize) {
      this.messageTimestamps.shift();
    }
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[WebSocketSync] ${message}`)
    }
  }
} 