import { z } from 'zod';

// Core event interface - much more efficient
export interface KSyncEvent<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: number;
  clientId: string;
  version: number;
}

// Streaming support for AI apps
export interface StreamChunk {
  streamId: string;
  sequence: number;
  data: string;
  isComplete: boolean;
  timestamp: number;
}

export interface StreamState {
  id: string;
  chunks: StreamChunk[];
  isComplete: boolean;
  lastSequence: number;
  content: string;
}

// WebSocket message types
export type WSMessageType = 
  | 'event' 
  | 'sync-request' 
  | 'sync-response' 
  | 'ping' 
  | 'pong'
  | 'stream-chunk'
  | 'stream-complete'
  | 'presence-update'

export interface WebSocketMessage<T = any> {
  type: WSMessageType;
  data?: T;
  requestId?: string;
}

// Presence system for efficient state tracking
export interface PresenceState {
  [clientId: string]: {
    username?: string;
    lastSeen: number;
    data: Record<string, any>;
  }
}

// Configuration
export interface KSyncConfig {
  serverUrl?: string;
  clientId?: string;
  debug?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  presenceUpdateInterval?: number;
  eventBatchSize?: number;
  streamBufferSize?: number;
}

// Storage interface
export interface KSyncStorage {
  getEvents(fromVersion?: number): Promise<KSyncEvent[]>;
  storeEvent(event: KSyncEvent): Promise<void>;
  storeEvents(events: KSyncEvent[]): Promise<void>;
  getLastVersion(): Promise<number>;
  clear(): Promise<void>;
}

// Sync interface
export interface KSyncSync {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: WebSocketMessage): Promise<void>;
  isConnected(): boolean;
  onMessage(callback: (message: WebSocketMessage) => void): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
}

// Type-safe event definitions
export type EventSchema<T> = z.ZodSchema<T>;

// Efficient batching
export interface EventBatch {
  events: KSyncEvent[];
  fromVersion: number;
  toVersion: number;
  timestamp: number;
}

// Error types
export class KSyncError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'KSyncError';
  }
}

// Streaming types for AI
export interface StreamOptions {
  streamId?: string;
  bufferSize?: number;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

// Presence types
export interface PresenceOptions {
  updateInterval?: number;
  data?: Record<string, any>;
}

// Event listener types
export type EventListener<T = any> = (event: KSyncEvent<T>) => void;
export type StreamListener = (chunk: StreamChunk) => void;
export type PresenceListener = (presence: PresenceState) => void;

// Extended types for new features
export interface CRDTConfig {
  enableCRDT?: boolean;
  crdtTypes?: Record<string, 'lww' | 'gset' | 'gcounter' | 'map'>;
} 