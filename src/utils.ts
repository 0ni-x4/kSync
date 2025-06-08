// Generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Generate client ID (persistent across sessions)
export function getClientId(): string {
  if (typeof window !== 'undefined') {
    let clientId = localStorage.getItem('ksync-client-id');
    if (!clientId) {
      clientId = generateId();
      localStorage.setItem('ksync-client-id', clientId);
    }
    return clientId;
  }
  // Server-side or Node.js
  return `server-${generateId()}`;
}

// Simple logger
export function createLogger(debug: boolean = false) {
  return {
    log: (...args: any[]) => debug && console.log('[kSync]', ...args),
    error: (...args: any[]) => console.error('[kSync]', ...args),
    warn: (...args: any[]) => debug && console.warn('[kSync]', ...args),
  };
}

// Deep clone utility
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Check if running in browser
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
} 