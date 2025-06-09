import { KSyncEvent, KSyncSync, WebSocketMessage, EventBatch } from '../types';
import { VectorClock, VectorClockUtil, CRDTEvent } from '../crdt';

export interface GitSyncConfig {
  remoteUrl: string;
  authToken?: string;
  pullInterval?: number;
  batchSize?: number;
  compression?: boolean;
}

export interface SyncState {
  lastPull: number;
  lastPush: number;
  vectorClock: VectorClock;
  remoteVectorClock: VectorClock;
  pendingEvents: KSyncEvent[];
  conflictEvents: KSyncEvent[];
}

export interface PullResult {
  newEvents: KSyncEvent[];
  conflicts: KSyncEvent[];
  remoteHead: VectorClock;
}

export interface PushResult {
  accepted: KSyncEvent[];
  rejected: KSyncEvent[];
  conflicts: KSyncEvent[];
  newRemoteHead: VectorClock;
}

export class GitSyncClient implements KSyncSync {
  private syncState: SyncState;
  private messageCallbacks: ((message: WebSocketMessage) => void)[] = [];
  private connectCallbacks: (() => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];
  private connected = false;
  private pullTimer?: any;

  constructor(
    private config: GitSyncConfig,
    private clientId: string
  ) {
    this.syncState = {
      lastPull: 0,
      lastPush: 0,
      vectorClock: VectorClockUtil.create(clientId),
      remoteVectorClock: {},
      pendingEvents: [],
      conflictEvents: []
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
    
    // Start periodic pulling if configured
    if (this.config.pullInterval) {
      this.pullTimer = setInterval(() => {
        this.pull().catch(console.error);
      }, this.config.pullInterval);
    }

    this.connectCallbacks.forEach(cb => cb());
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = undefined;
    }

    this.disconnectCallbacks.forEach(cb => cb());
  }

  // Git-like pull operation
  async pull(): Promise<PullResult> {
    const response = await this.fetch(`${this.config.remoteUrl}/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authToken && { 'Authorization': `Bearer ${this.config.authToken}` })
      },
      body: JSON.stringify({
        clientId: this.clientId,
        vectorClock: this.syncState.vectorClock,
        lastPull: this.syncState.lastPull
      })
    });

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.statusText}`);
    }

    const data = await response.json();
    const { events, remoteVectorClock, timestamp } = data;

    const newEvents: KSyncEvent[] = [];
    const conflicts: KSyncEvent[] = [];

    // Process incoming events and detect conflicts
    for (const event of events) {
      const hasConflict = this.detectConflict(event);
      
      if (hasConflict) {
        conflicts.push(event);
      } else {
        newEvents.push(event);
      }
    }

    // Update sync state
    this.syncState.lastPull = timestamp;
    this.syncState.remoteVectorClock = VectorClockUtil.merge(
      this.syncState.remoteVectorClock,
      remoteVectorClock
    );

    // Notify listeners about new events
    for (const event of newEvents) {
      this.messageCallbacks.forEach(cb => cb({
        type: 'event',
        data: event
      }));
    }

    return {
      newEvents,
      conflicts,
      remoteHead: remoteVectorClock
    };
  }

  // Git-like push operation
  async push(events?: KSyncEvent[]): Promise<PushResult> {
    const eventsToSync = events || this.syncState.pendingEvents;
    
    if (eventsToSync.length === 0) {
      return {
        accepted: [],
        rejected: [],
        conflicts: [],
        newRemoteHead: this.syncState.remoteVectorClock
      };
    }

    // Convert events to CRDT events with vector clocks
    const crdtEvents: CRDTEvent[] = eventsToSync.map(event => ({
      ...event,
      clientId: event.clientId || this.clientId,
      vectorClock: this.syncState.vectorClock
    }));

    const response = await this.fetch(`${this.config.remoteUrl}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authToken && { 'Authorization': `Bearer ${this.config.authToken}` })
      },
      body: JSON.stringify({
        clientId: this.clientId,
        events: crdtEvents,
        vectorClock: this.syncState.vectorClock,
        baseVectorClock: this.syncState.remoteVectorClock
      })
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.statusText}`);
    }

    const data = await response.json();
    const { accepted, rejected, conflicts, newRemoteHead } = data;

    // Update sync state
    this.syncState.lastPush = Date.now();
    this.syncState.remoteVectorClock = newRemoteHead;
    
    // Increment vector clock for accepted events
    if (accepted.length > 0) {
      this.syncState.vectorClock = VectorClockUtil.increment(
        this.syncState.vectorClock,
        this.clientId
      );
    }

    // Remove accepted events from pending
    const acceptedIds = new Set(accepted.map((e: KSyncEvent) => e.id));
    this.syncState.pendingEvents = this.syncState.pendingEvents.filter(
      event => !acceptedIds.has(event.id)
    );

    return {
      accepted,
      rejected,
      conflicts,
      newRemoteHead
    };
  }

  // Force sync (pull then push)
  async sync(): Promise<{ pullResult: PullResult; pushResult: PushResult }> {
    const pullResult = await this.pull();
    const pushResult = await this.push();
    
    return { pullResult, pushResult };
  }

  // Check sync status
  getSyncStatus(): {
    pendingEvents: number;
    lastPull: Date | null;
    lastPush: Date | null;
    conflicts: number;
    isAhead: boolean;
    isBehind: boolean;
  } {
    const now = Date.now();
    const comparison = VectorClockUtil.compare(
      this.syncState.vectorClock,
      this.syncState.remoteVectorClock
    );

    return {
      pendingEvents: this.syncState.pendingEvents.length,
      lastPull: this.syncState.lastPull ? new Date(this.syncState.lastPull) : null,
      lastPush: this.syncState.lastPush ? new Date(this.syncState.lastPush) : null,
      conflicts: this.syncState.conflictEvents.length,
      isAhead: comparison === 'after',
      isBehind: comparison === 'before'
    };
  }

  // Conflict resolution
  async resolveConflicts(resolutions: { eventId: string; resolution: 'local' | 'remote' | 'merge' }[]): Promise<void> {
    for (const { eventId, resolution } of resolutions) {
      const conflictIndex = this.syncState.conflictEvents.findIndex(e => e.id === eventId);
      if (conflictIndex === -1) continue;

      const conflictEvent = this.syncState.conflictEvents[conflictIndex];
      
      switch (resolution) {
        case 'local':
          // Keep local version, discard remote
          this.syncState.conflictEvents.splice(conflictIndex, 1);
          break;
          
        case 'remote':
          // Accept remote version
          this.syncState.conflictEvents.splice(conflictIndex, 1);
          this.messageCallbacks.forEach(cb => cb({
            type: 'event',
            data: conflictEvent
          }));
          break;
          
        case 'merge':
          // Custom merge logic would go here
          // For now, default to remote
          this.syncState.conflictEvents.splice(conflictIndex, 1);
          this.messageCallbacks.forEach(cb => cb({
            type: 'event',
            data: conflictEvent
          }));
          break;
      }
    }
  }

  // Implementation of KSyncSync interface
  async send(message: WebSocketMessage): Promise<void> {
    if (message.type === 'event' && message.data) {
      // Queue event for next push
      this.syncState.pendingEvents.push(message.data);
      
      // Auto-push if configured (optional)
      // await this.push([message.data]);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(callback: (message: WebSocketMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  private async fetch(url: string, options: RequestInit): Promise<Response> {
    // Add compression if configured
    if (this.config.compression) {
      options.headers = {
        ...options.headers,
        'Accept-Encoding': 'gzip, deflate, br'
      };
    }

    return fetch(url, options);
  }

  private detectConflict(remoteEvent: KSyncEvent): boolean {
    // Simple conflict detection based on timestamp and event type
    // In a real implementation, this would be more sophisticated
    const localEvents = this.syncState.pendingEvents.filter(
      local => local.type === remoteEvent.type && 
               local.data?.id === remoteEvent.data?.id
    );

    return localEvents.length > 0;
  }
}

// Git-like branch management
export class GitSyncBranch {
  constructor(
    private client: GitSyncClient,
    private branchName: string
  ) {}

  async checkout(): Promise<void> {
    // Switch to different branch
    // Implementation would involve changing the remote URL or headers
  }

  async merge(sourceBranch: string): Promise<PullResult> {
    // Merge events from another branch
    // This would be a server-side operation typically
    const response = await fetch(`${(this.client as any).config.remoteUrl}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetBranch: this.branchName,
        sourceBranch: sourceBranch
      })
    });

    return response.json();
  }
}

// Factory function
export function createGitSync(config: GitSyncConfig, clientId: string): GitSyncClient {
  return new GitSyncClient(config, clientId);
} 