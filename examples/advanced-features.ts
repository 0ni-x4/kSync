import { z } from 'zod';
import { 
  createMultistore, 
  createGitSync, 
  LWWRegister, 
  GSet, 
  DrizzleKSyncAdapter 
} from '../src';

// Example 1: Multistore with CRDT
async function multistoreExample() {
  console.log('🏪 Multistore Example');
  
  const multistore = createMultistore({
    stores: {
      'user-store': {
        serverUrl: 'ws://localhost:8080',
        debug: true
      },
      'chat-store': {
        serverUrl: 'ws://localhost:8081',
        debug: true
      },
      'ai-store': {
        serverUrl: 'ws://localhost:8082',
        debug: true
      }
    },
    sharedSync: false, // Each store has its own connection
    globalConfig: {
      debug: true
    }
  });

  await multistore.initialize();

  const userStore = multistore.getStore('user-store');
  const chatStore = multistore.getStore('chat-store');

  // Define schemas
  userStore.defineSchema('user-updated', z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    preferences: z.any() // CRDT data
  }));

  chatStore.defineSchema('message-sent', z.object({
    id: z.string(),
    content: z.string(),
    author: z.string(),
    reactions: z.any() // CRDT Set
  }));

  // Send events with CRDT data
  await userStore.send('user-updated', {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    preferences: new LWWRegister('dark-mode', Date.now(), 'client-1').toJSON()
  });

  await chatStore.send('message-sent', {
    id: 'msg-1',
    content: 'Hello everyone!',
    author: 'Alice',
    reactions: new GSet(new Set(['👍', '❤️'])).toJSON()
  });

  console.log('📊 Store Stats:', multistore.getStats());
}

// Example 2: Drizzle ORM Integration
async function drizzleExample() {
  console.log('🗄️ Drizzle ORM Example');
  
  const multistore = createMultistore({
    stores: {
      'main': { debug: true }
    }
  });

  await multistore.initialize();
  const store = multistore.getStore('main');
  const db = multistore.getDrizzle('main');

  // Define event schemas
  store.defineSchema('user:created', z.object({
    id: z.string(),
    name: z.string(),
    email: z.string()
  }));

  store.defineSchema('user:updated', z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional()
  }));

  // Send events (these become database records)
  await store.send('user:created', {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com'
  });

  await store.send('user:created', {
    id: 'user-2',
    name: 'Bob',
    email: 'bob@example.com'
  });

  // Query like a normal database
  const users = db.table('user');
  
  const allUsers = await users.findMany();
  console.log('All users:', allUsers);

  const alice = await users.findById('user-1');
  console.log('Alice:', alice);

  const emailQuery = await users.query()
    .where({ field: 'email', operator: 'like', value: '@example.com' })
    .orderBy({ field: 'name', direction: 'asc' })
    .execute();
  
  console.log('Users with @example.com:', emailQuery.data);
}

// Example 3: Git-like Sync
async function gitSyncExample() {
  console.log('🔄 Git Sync Example');
  
  const gitSync = createGitSync({
    remoteUrl: 'https://api.example.com/ksync',
    authToken: 'your-auth-token',
    pullInterval: 30000, // Pull every 30 seconds
    compression: true
  }, 'client-1');

  await gitSync.connect();

  // Manual pull
  const pullResult = await gitSync.pull();
  console.log('Pull result:', pullResult);

  // Queue some events for push
  await gitSync.send({
    type: 'event',
    data: {
      id: 'event-1',
      type: 'user-action',
      data: { action: 'click', target: 'button' },
      timestamp: Date.now(),
      clientId: 'client-1',
      version: 1
    }
  });

  // Manual push
  const pushResult = await gitSync.push();
  console.log('Push result:', pushResult);

  // Full sync (pull + push)
  const syncResult = await gitSync.sync();
  console.log('Sync result:', syncResult);

  // Check sync status
  const status = gitSync.getSyncStatus();
  console.log('Sync status:', status);
}

// Example 4: Cross-store Operations
async function crossStoreExample() {
  console.log('🔗 Cross-store Example');
  
  const multistore = createMultistore({
    stores: {
      'orders': { debug: true },
      'inventory': { debug: true },
      'analytics': { debug: true }
    }
  });

  await multistore.initialize();

  // Define schemas
  const ordersStore = multistore.getStore('orders');
  const inventoryStore = multistore.getStore('inventory');

  ordersStore.defineSchema('order-placed', z.object({
    id: z.string(),
    productId: z.string(),
    quantity: z.number(),
    customerId: z.string()
  }));

  inventoryStore.defineSchema('stock-updated', z.object({
    productId: z.string(),
    quantity: z.number(),
    operation: z.enum(['add', 'subtract'])
  }));

  // Cross-store event listener
  multistore.onCrossStore('order-placed', async (storeName: string, event: any) => {
    console.log(`Order placed in ${storeName}:`, event.data);
    
    // Update inventory in response to order
    await inventoryStore.send('stock-updated', {
      productId: event.data.productId,
      quantity: event.data.quantity,
      operation: 'subtract'
    });
  });

  // Send order event
  await ordersStore.send('order-placed', {
    id: 'order-1',
    productId: 'product-123',
    quantity: 2,
    customerId: 'customer-456'
  });

  // Create derived store for analytics
  const analyticsStore = multistore.createDerivedStore(
    'analytics', 
    ['orders', 'inventory'],
    { debug: true }
  );

  analyticsStore.defineMaterializer('sales-summary', (events: any[]) => {
    const orders = events.filter((e: any) => e.type.includes('order-placed'));
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum: number, order: any) => {
      return sum + (order.data.quantity * 100); // Assume $100 per item
    }, 0);

    return {
      totalOrders,
      totalRevenue,
      lastUpdated: Date.now()
    };
  });

  setTimeout(() => {
    const summary = analyticsStore.getState('sales-summary');
    console.log('Sales summary:', summary);
  }, 1000);
}

// Example 5: Advanced CRDT Operations
async function crdtExample() {
  console.log('🔀 CRDT Example');
  
  const multistore = createMultistore({
    stores: {
      'collaborative-doc': { debug: true }
    }
  });

  await multistore.initialize();
  const store = multistore.getStore('collaborative-doc');

  // Simulate collaborative document editing
  store.defineSchema('doc-updated', z.object({
    docId: z.string(),
    field: z.string(),
    value: z.any()
  }));

  // Client 1 updates title
  const titleUpdate1 = new LWWRegister('My Document', Date.now(), 'client-1');
  await store.send('doc-updated', {
    docId: 'doc-1',
    field: 'title',
    value: titleUpdate1.toJSON()
  });

  // Client 2 updates title slightly later
  const titleUpdate2 = new LWWRegister('Our Shared Document', Date.now() + 1000, 'client-2');
  await store.send('doc-updated', {
    docId: 'doc-1',
    field: 'title',
    value: titleUpdate2.toJSON()
  });

  // Both clients add tags
  const tags1 = new GSet(new Set(['javascript', 'typescript']));
  const tags2 = new GSet(new Set(['react', 'node']));

  await store.send('doc-updated', {
    docId: 'doc-1',
    field: 'tags',
    value: tags1.toJSON()
  });

  await store.send('doc-updated', {
    docId: 'doc-1',
    field: 'tags',
    value: tags2.toJSON()
  });

  // Materializer to resolve CRDT conflicts
  store.defineMaterializer('documents', (events: any[]) => {
    const docs: Record<string, any> = {};

    for (const event of events) {
      if (event.type === 'doc-updated') {
        const { docId, field, value } = event.data;
        
        if (!docs[docId]) {
          docs[docId] = { id: docId };
        }

        // Handle CRDT merging
        if (value.__crdtType === 'LWWRegister') {
          const current = docs[docId][field];
          if (!current || value.timestamp > current.timestamp) {
            docs[docId][field] = value.value;
          }
        } else if (value.__crdtType === 'GSet') {
          const current = docs[docId][field] || [];
          docs[docId][field] = [...new Set([...current, ...value.elements])];
        }
      }
    }

    return Object.values(docs);
  });

  setTimeout(() => {
    const documents = store.getState('documents');
    console.log('Resolved documents:', documents);
  }, 1000);
}

// Run all examples
async function main() {
  try {
    await multistoreExample();
    await drizzleExample();
    await gitSyncExample();
    await crossStoreExample();
    await crdtExample();
  } catch (error) {
    console.error('Example error:', error);
  }
}

if (require.main === module) {
  main();
} 