import { z } from 'zod';

// Core event interface - much more efficient
export interface KSyncEvent {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  version: number;
  userId: string;
  clientId?: string;  // Backward compatibility
  metadata?: Record<string, any>;
  ttl?: number;
  priority?: 'low' | 'normal' | 'high';
}

// Streaming support for AI apps
export interface StreamChunk {
  data: any;
  metadata?: Record<string, any>;
  complete?: boolean;
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
  | 'event-batch'
  | 'sync-request' 
  | 'sync-response' 
  | 'ping' 
  | 'pong'
  | 'stream-start'
  | 'stream-chunk'
  | 'stream-end'
  | 'stream-complete'
  | 'presence-update'
  | 'join'
  | 'leave'
  | 'auth'

export interface WebSocketMessage {
  type: string;
  data?: any;
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
  saveEvents(events: KSyncEvent[]): Promise<void>;
  loadEvents(): Promise<KSyncEvent[]>;
  clear(): Promise<void>;
}

// Sync interface
export interface KSyncSync {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: WebSocketMessage): Promise<void>;
  onMessage(handler: (message: WebSocketMessage) => void): void;
  onConnect(handler: () => void): void;
  onDisconnect(handler: () => void): void;
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
  constructor(message: string, public code: string) {
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
export type EventListener<T = any> = (event: KSyncEvent) => void;
export type StreamListener = (chunk: StreamChunk) => void;
export type PresenceListener = (presence: PresenceState) => void;

// Extended types for new features
export interface CRDTConfig {
  enableCRDT?: boolean;
  crdtTypes?: Record<string, 'lww' | 'gset' | 'gcounter' | 'map'>;
}

// Presence info
export interface PresenceInfo {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: number;
  metadata?: Record<string, any>;
} 