import { createLogger } from './utils';

export class LeaderElection {
  private isLeader = false;
  private lockName: string;
  private logger = createLogger();
  private onLeaderChange?: (isLeader: boolean) => void;
  private heartbeatInterval?: number;
  private lockController?: AbortController;

  constructor(
    lockName: string = 'ksync-leader',
    debug: boolean = false
  ) {
    this.lockName = lockName;
    this.logger = createLogger(debug);
  }

  async start(onLeaderChange?: (isLeader: boolean) => void): Promise<void> {
    this.onLeaderChange = onLeaderChange;

    if (this.supportsWebLocks()) {
      await this.startWebLocksElection();
    } else {
      await this.startIndexedDBElection();
    }
  }

  async stop(): Promise<void> {
    if (this.lockController) {
      this.lockController.abort();
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.isLeader) {
      this.isLeader = false;
      this.onLeaderChange?.(false);
    }
  }

  getIsLeader(): boolean {
    return this.isLeader;
  }

  private supportsWebLocks(): boolean {
    return typeof navigator !== 'undefined' && 'locks' in navigator;
  }

  private async startWebLocksElection(): Promise<void> {
    this.lockController = new AbortController();
    
    try {
      await navigator.locks.request(
        this.lockName,
        { signal: this.lockController.signal },
        async () => {
          this.logger.log('Acquired leadership lock');
          this.isLeader = true;
          this.onLeaderChange?.(true);

          // Hold the lock until aborted
          return new Promise((resolve) => {
            this.lockController!.signal.addEventListener('abort', () => {
              this.logger.log('Released leadership lock');
              this.isLeader = false;
              this.onLeaderChange?.(false);
              resolve(undefined);
            });
          });
        }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Expected when stopping
        return;
      }
      this.logger.error('Web Locks election error:', error);
      // Fallback to IndexedDB
      await this.startIndexedDBElection();
    }
  }

  private async startIndexedDBElection(): Promise<void> {
    const dbName = `${this.lockName}-election`;
    const storeName = 'leader';
    const leaderKey = 'current-leader';
    const heartbeatInterval = 5000; // 5 seconds
    const leaderTimeout = 15000; // 15 seconds

    const db = await this.openElectionDB(dbName, storeName);
    
    const tryBecomeLeader = async (): Promise<void> => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const currentLeader = await new Promise<any>((resolve, reject) => {
        const request = store.get(leaderKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const now = Date.now();
      const shouldBecomeLeader = !currentLeader || 
        (now - currentLeader.timestamp) > leaderTimeout;

      if (shouldBecomeLeader) {
        const leaderData = {
          id: leaderKey,
          clientId: this.getClientId(),
          timestamp: now
        };

        await new Promise<void>((resolve, reject) => {
          const request = store.put(leaderData);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        if (!this.isLeader) {
          this.isLeader = true;
          this.logger.log('Became leader via IndexedDB');
          this.onLeaderChange?.(true);
        }
      } else if (this.isLeader && currentLeader.clientId !== this.getClientId()) {
        this.isLeader = false;
        this.logger.log('Lost leadership via IndexedDB');
        this.onLeaderChange?.(false);
      }
    };

    // Initial attempt
    await tryBecomeLeader();

    // Set up heartbeat
    this.heartbeatInterval = setInterval(async () => {
      try {
        await tryBecomeLeader();
      } catch (error) {
        this.logger.error('IndexedDB election error:', error);
      }
    }, heartbeatInterval) as any;
  }

  private async openElectionDB(dbName: string, storeName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
    });
  }

  private getClientId(): string {
    // Simple client ID for this session
    if (typeof window !== 'undefined') {
      if (!window.__ksyncClientId) {
        window.__ksyncClientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return window.__ksyncClientId;
    }
    return `server-${Date.now()}`;
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    __ksyncClientId?: string;
  }
} 