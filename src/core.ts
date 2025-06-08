import { z } from 'zod'
import { 
  KSyncEvent, 
  KSyncConfig, 
  KSyncStorage, 
  KSyncSync,
  EventListener,
  StreamListener,
  PresenceListener,
  WebSocketMessage,
  StreamChunk,
  StreamState,
  PresenceState,
  StreamOptions,
  EventSchema,
  KSyncError
} from './types'
import { generateId } from './utils'

function log(debug: boolean | undefined, message: string): void {
  if (debug) {
    console.log(`[kSync] ${message}`)
  }
}

export class KSync {
  private events: KSyncEvent[] = []
  private schemas = new Map<string, z.ZodSchema>()
  private listeners = new Map<string, EventListener[]>()
  private streamListeners = new Map<string, StreamListener[]>()
  private presenceListeners: PresenceListener[] = []
  private materializers = new Map<string, (events: KSyncEvent[]) => any>()
  
  private streams = new Map<string, StreamState>()
  private presence: PresenceState = {}
  private myPresence: Record<string, any> = {}
  
  private storage?: KSyncStorage
  private sync?: KSyncSync
  private isInitialized = false
  private lastVersion = 0
  private clientId: string
  
  // Efficiency improvements
  private eventBatchTimeout?: NodeJS.Timeout
  private pendingEvents: KSyncEvent[] = []
  private presenceUpdateTimeout?: NodeJS.Timeout
  
  constructor(private config: KSyncConfig = {}) {
    this.clientId = config.clientId || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      presenceUpdateInterval: 5000,
      eventBatchSize: 10,
      streamBufferSize: 1000,
      ...config
    }
  }

  async initialize(storage?: KSyncStorage, sync?: KSyncSync): Promise<void> {
    if (this.isInitialized) {
      throw new KSyncError('Already initialized', 'ALREADY_INITIALIZED')
    }

    this.storage = storage
    this.sync = sync

    if (this.storage) {
      this.events = await this.storage.getEvents()
      this.lastVersion = await this.storage.getLastVersion()
    }

    if (this.sync) {
      this.setupSyncHandlers()
      await this.sync.connect()
    }

    this.isInitialized = true
    this.startPresenceUpdates()
    
    log(this.config.debug, 'KSync initialized')
  }

  // Type-safe schema definition
  defineSchema<T>(type: string, schema: EventSchema<T>): void {
    this.schemas.set(type, schema)
  }

  // Efficient event sending with batching
  async send<T>(type: string, data: T): Promise<void> {
    if (!this.isInitialized) {
      throw new KSyncError('Not initialized', 'NOT_INITIALIZED')
    }

    // Validate against schema
    const schema = this.schemas.get(type)
    if (schema) {
      try {
        schema.parse(data)
      } catch (error) {
        throw new KSyncError(`Schema validation failed for ${type}`, 'VALIDATION_ERROR', error)
      }
    }

    const event: KSyncEvent<T> = {
      id: generateId(),
      type,
      data,
      timestamp: Date.now(),
      clientId: this.clientId,
      version: 0 // Will be set by server
    }

    // Store locally first
    this.events.push(event)
    this.lastVersion = Math.max(this.lastVersion, event.version)
    
    if (this.storage) {
      await this.storage.storeEvent(event)
    }

    // Batch events for efficiency
    this.pendingEvents.push(event)
    this.scheduleBatchSend()

    // Notify local listeners immediately (optimistic update)
    this.notifyListeners(event)
  }

  // Streaming support for AI apps
  async startStream(options: StreamOptions = {}): Promise<string> {
    const streamId = options.streamId || generateId()
    
    const streamState: StreamState = {
      id: streamId,
      chunks: [],
      isComplete: false,
      lastSequence: 0,
      content: ''
    }
    
    this.streams.set(streamId, streamState)
    
    if (options.onChunk) {
      this.onStreamChunk(streamId, (chunk) => {
        options.onChunk!(chunk.data)
      })
    }
    
    if (options.onComplete) {
      this.onStreamComplete(streamId, (content) => {
        options.onComplete!(content)
      })
    }
    
    return streamId
  }

  async streamChunk(streamId: string, data: string): Promise<void> {
    const stream = this.streams.get(streamId)
    if (!stream) {
      throw new KSyncError(`Stream ${streamId} not found`, 'STREAM_NOT_FOUND')
    }

    const chunk: StreamChunk = {
      streamId,
      sequence: stream.lastSequence + 1,
      data,
      isComplete: false,
      timestamp: Date.now()
    }

    stream.chunks.push(chunk)
    stream.lastSequence = chunk.sequence
    stream.content += data

    // Send chunk efficiently
    if (this.sync?.isConnected()) {
      await this.sync.send({
        type: 'stream-chunk',
        data: chunk
      })
    }

    // Notify listeners
    this.notifyStreamListeners(streamId, chunk)
  }

  async completeStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId)
    if (!stream) {
      throw new KSyncError(`Stream ${streamId} not found`, 'STREAM_NOT_FOUND')
    }

    stream.isComplete = true

    if (this.sync?.isConnected()) {
      await this.sync.send({
        type: 'stream-complete',
        data: { streamId, content: stream.content }
      })
    }

    // Notify completion
    const listeners = this.streamListeners.get(`${streamId}:complete`) || []
    listeners.forEach(listener => {
      try {
        listener({
          streamId,
          sequence: -1,
          data: stream.content,
          isComplete: true,
          timestamp: Date.now()
        })
      } catch (error) {
        log(this.config.debug, `Error in stream completion listener: ${error}`)
      }
    })
  }

  // Efficient presence system
  updatePresence(data: Record<string, any>): void {
    this.myPresence = { ...this.myPresence, ...data }
    this.schedulePresenceUpdate()
  }

  getPresence(): PresenceState {
    return { ...this.presence }
  }

  // Type-safe event listeners
  on<T>(type: string, listener: EventListener<T>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type)!.push(listener as EventListener)
  }

  off<T>(type: string, listener: EventListener<T>): void {
    const listeners = this.listeners.get(type)
    if (listeners) {
      const index = listeners.indexOf(listener as EventListener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  // Stream listeners
  onStreamChunk(streamId: string, listener: StreamListener): void {
    const key = `${streamId}:chunk`
    if (!this.streamListeners.has(key)) {
      this.streamListeners.set(key, [])
    }
    this.streamListeners.get(key)!.push(listener)
  }

  onStreamComplete(streamId: string, listener: (content: string) => void): void {
    const key = `${streamId}:complete`
    if (!this.streamListeners.has(key)) {
      this.streamListeners.set(key, [])
    }
    this.streamListeners.get(key)!.push((chunk) => {
      if (chunk.isComplete) {
        listener(chunk.data)
      }
    })
  }

  // Presence listeners
  onPresence(listener: PresenceListener): void {
    this.presenceListeners.push(listener)
  }

  // Get events efficiently
  getEvents(fromVersion?: number): KSyncEvent[] {
    if (fromVersion === undefined) {
      return [...this.events]
    }
    return this.events.filter(event => event.version > fromVersion)
  }

  getStream(streamId: string): StreamState | undefined {
    return this.streams.get(streamId)
  }

  // Materializer support for state management
  defineMaterializer(name: string, materializer: (events: KSyncEvent[]) => any): void {
    this.materializers.set(name, materializer)
  }

  getState(name: string): any {
    const materializer = this.materializers.get(name)
    if (!materializer) {
      return undefined
    }
    return materializer(this.events)
  }

  // Cleanup
  async close(): Promise<void> {
    if (this.eventBatchTimeout) {
      clearTimeout(this.eventBatchTimeout)
    }
    if (this.presenceUpdateTimeout) {
      clearTimeout(this.presenceUpdateTimeout)
    }
    
    if (this.sync) {
      await this.sync.disconnect()
    }
    
    this.isInitialized = false
    log(this.config.debug, 'KSync closed')
  }

  // Alias for close
  async disconnect(): Promise<void> {
    await this.close()
  }

  // Private methods for efficiency

  private setupSyncHandlers(): void {
    if (!this.sync) return

    this.sync.onMessage((message: WebSocketMessage) => {
      this.handleSyncMessage(message)
    })

    this.sync.onConnect(() => {
      log(this.config.debug, 'Connected to server')
      this.requestSync()
    })

    this.sync.onDisconnect(() => {
      log(this.config.debug, 'Disconnected from server')
    })
  }

  private async handleSyncMessage(message: WebSocketMessage): Promise<void> {
    switch (message.type) {
      case 'event':
        await this.handleRemoteEvent(message.data)
        break
      case 'sync-response':
        await this.handleSyncResponse(message.data)
        break
      case 'stream-chunk':
        this.handleStreamChunk(message.data)
        break
      case 'stream-complete':
        this.handleStreamComplete(message.data)
        break
      case 'presence-update':
        this.handlePresenceUpdate(message.data)
        break
      case 'ping':
        if (this.sync) {
          await this.sync.send({ type: 'pong' })
        }
        break
    }
  }

  private async handleRemoteEvent(event: KSyncEvent): Promise<void> {
    // Avoid duplicates
    if (this.events.some(e => e.id === event.id)) {
      return
    }

    this.events.push(event)
    this.lastVersion = Math.max(this.lastVersion, event.version)
    
    if (this.storage) {
      await this.storage.storeEvent(event)
    }

    this.notifyListeners(event)
  }

  private async handleSyncResponse(events: KSyncEvent[]): Promise<void> {
    for (const event of events) {
      await this.handleRemoteEvent(event)
    }
    log(this.config.debug, `Synced ${events.length} events`)
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    let stream = this.streams.get(chunk.streamId)
    if (!stream) {
      stream = {
        id: chunk.streamId,
        chunks: [],
        isComplete: false,
        lastSequence: 0,
        content: ''
      }
      this.streams.set(chunk.streamId, stream)
    }

    stream.chunks.push(chunk)
    stream.lastSequence = Math.max(stream.lastSequence, chunk.sequence)
    stream.content += chunk.data

    this.notifyStreamListeners(chunk.streamId, chunk)
  }

  private handleStreamComplete(data: { streamId: string, content: string }): void {
    const stream = this.streams.get(data.streamId)
    if (stream) {
      stream.isComplete = true
      stream.content = data.content
    }

    const listeners = this.streamListeners.get(`${data.streamId}:complete`) || []
    listeners.forEach(listener => {
      try {
        listener({
          streamId: data.streamId,
          sequence: -1,
          data: data.content,
          isComplete: true,
          timestamp: Date.now()
        })
      } catch (error) {
        log(this.config.debug, `Error in stream completion listener: ${error}`)
      }
    })
  }

  private handlePresenceUpdate(presence: PresenceState): void {
    this.presence = presence
    this.presenceListeners.forEach(listener => {
      try {
        listener(presence)
      } catch (error) {
        log(this.config.debug, `Error in presence listener: ${error}`)
      }
    })
  }

  private notifyListeners(event: KSyncEvent): void {
    const listeners = this.listeners.get(event.type) || []
    listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        log(this.config.debug, `Error in event listener: ${error}`)
      }
    })
  }

  private notifyStreamListeners(streamId: string, chunk: StreamChunk): void {
    const listeners = this.streamListeners.get(`${streamId}:chunk`) || []
    listeners.forEach(listener => {
      try {
        listener(chunk)
      } catch (error) {
        log(this.config.debug, `Error in stream listener: ${error}`)
      }
    })
  }

  private scheduleBatchSend(): void {
    if (this.eventBatchTimeout) return

    this.eventBatchTimeout = setTimeout(async () => {
      await this.flushPendingEvents()
      this.eventBatchTimeout = undefined
    }, 50) // Batch events for 50ms
  }

  private async flushPendingEvents(): Promise<void> {
    if (this.pendingEvents.length === 0 || !this.sync?.isConnected()) {
      return
    }

    const events = this.pendingEvents.splice(0, this.config.eventBatchSize!)
    
    for (const event of events) {
      await this.sync.send({
        type: 'event',
        data: event
      })
    }
  }

  private schedulePresenceUpdate(): void {
    if (this.presenceUpdateTimeout) return

    this.presenceUpdateTimeout = setTimeout(async () => {
      if (this.sync?.isConnected()) {
        await this.sync.send({
          type: 'presence-update',
          data: {
            clientId: this.clientId,
            data: this.myPresence,
            timestamp: Date.now()
          }
        })
      }
      this.presenceUpdateTimeout = undefined
    }, this.config.presenceUpdateInterval!)
  }

  private startPresenceUpdates(): void {
    setInterval(() => {
      this.schedulePresenceUpdate()
    }, this.config.presenceUpdateInterval!)
  }

  private async requestSync(): Promise<void> {
    if (this.sync?.isConnected()) {
      await this.sync.send({
        type: 'sync-request',
        data: { fromVersion: this.lastVersion }
      })
    }
  }
} 