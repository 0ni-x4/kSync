// Generate unique IDs
export function generateId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
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

/**
 * Test WebSocket connectivity and provide debugging information
 * Useful for troubleshooting connection issues in development
 */
export async function testConnection(serverUrl: string, timeout: number = 5000): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    try {
      const ws = new WebSocket(serverUrl);
      
      const cleanup = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
      
      const connectionTimeout = setTimeout(() => {
        cleanup();
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          message: `Connection timeout after ${duration}ms`,
          details: {
            url: serverUrl,
            timeout: timeout,
            likely_causes: [
              'Server is not running',
              'Wrong port or URL',
              'Firewall blocking connection',
              'Server not accepting WebSocket connections'
            ]
          }
        });
      }, timeout);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        cleanup();
        const duration = Date.now() - startTime;
        resolve({
          success: true,
          message: `Connected successfully in ${duration}ms`,
          details: {
            url: serverUrl,
            duration: duration,
            readyState: 'OPEN'
          }
        });
      };
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        cleanup();
        const duration = Date.now() - startTime;
        
        let errorDetails: any = {
          url: serverUrl,
          duration: duration,
          error: error
        };
        
        // Common error patterns and solutions
        const troubleshooting = [];
        
        if (serverUrl.startsWith('http://') || serverUrl.startsWith('https://')) {
          troubleshooting.push('URL should start with ws:// or wss://, not http://');
        }
        
        if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
          troubleshooting.push('Make sure your development server is running');
        }
        
        troubleshooting.push('Check browser console for CORS or security errors');
        troubleshooting.push('Verify the server supports WebSocket connections');
        
        errorDetails.troubleshooting = troubleshooting;
        
        resolve({
          success: false,
          message: `Connection failed after ${duration}ms`,
          details: errorDetails
        });
      };
      
    } catch (error) {
      resolve({
        success: false,
        message: `Failed to create WebSocket: ${error}`,
        details: {
          url: serverUrl,
          error: error,
          likely_cause: 'Invalid WebSocket URL or browser compatibility issue'
        }
      });
    }
  });
}

/**
 * Quick diagnostic tool for common kSync connection issues
 * Provides actionable debugging information
 */
export async function diagnoseConnection(serverUrl: string): Promise<void> {
  console.log('🔍 kSync Connection Diagnostic');
  console.log('============================');
  console.log(`Testing connection to: ${serverUrl}\n`);
  
  // Basic URL validation
  if (!serverUrl.startsWith('ws://') && !serverUrl.startsWith('wss://')) {
    console.log('❌ Invalid WebSocket URL');
    console.log('💡 WebSocket URLs must start with ws:// (HTTP) or wss:// (HTTPS)');
    console.log(`   Your URL: ${serverUrl}`);
    console.log(`   Should be: ws://localhost:8080 or wss://your-domain.com/ws`);
    return;
  }
  
  console.log('⏳ Testing connection...');
  const result = await testConnection(serverUrl);
  
  if (result.success) {
    console.log('✅ Connection successful!');
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Duration: ${result.details.duration}ms`);
    }
  } else {
    console.log('❌ Connection failed');
    console.log(`   ${result.message}`);
    
    if (result.details) {
      console.log('\n🔧 Troubleshooting suggestions:');
      if (result.details.troubleshooting) {
        result.details.troubleshooting.forEach((tip: string, index: number) => {
          console.log(`   ${index + 1}. ${tip}`);
        });
      }
      
      if (result.details.likely_causes) {
        console.log('\n🤔 Likely causes:');
        result.details.likely_causes.forEach((cause: string, index: number) => {
          console.log(`   • ${cause}`);
        });
      }
    }
  }
  
  console.log('\n📚 For more help, visit: https://docs.ksync.dev/troubleshooting');
} 