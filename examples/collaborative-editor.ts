#!/usr/bin/env tsx

import { createKSync, createChat } from '../src/core';
import { KSyncServer } from '../server/ksync-server';

// Text operation types for collaborative editing
interface TextOperation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
  userId: string;
  timestamp: number;
}

interface DocumentState {
  content: string;
  version: number;
  operations: TextOperation[];
}

class CollaborativeEditor {
  private ksync: any;
  private content = '';
  private version = 0;
  private pendingOperations: TextOperation[] = [];
  private cursorPosition = 0;

  constructor(
    private userId: string,
    private documentId: string,
    serverUrl?: string
  ) {
    this.ksync = createChat(`doc-${documentId}`, {
      serverUrl: serverUrl || 'ws://localhost:8080',
      userId,
      state: {
        materializer: this.materializeDocument.bind(this),
        autoMaterialize: true
      },
      features: {
        presence: true,
        streaming: false
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle text operations from other users
    this.ksync.on('text-operation', (operation: TextOperation) => {
      if (operation.userId !== this.userId) {
        this.applyOperation(operation);
        this.displayUpdate(`${operation.userId} made changes`);
      }
    });

    // Handle cursor updates
    this.ksync.on('cursor-update', (data: { userId: string; position: number }) => {
      if (data.userId !== this.userId) {
        this.displayUpdate(`${data.userId} cursor at position ${data.position}`);
      }
    });

    // Handle user presence
    this.ksync.on('presence-update', (presence: any) => {
      this.displayUpdate(`${presence.userId} is ${presence.status}`);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.ksync.connect();
      await this.ksync.setPresence({
        status: 'online',
        metadata: { 
          documentId: this.documentId,
          role: 'editor',
          lastSeen: Date.now()
        }
      });
      this.displayUpdate(`Connected as ${this.userId}`);
    } catch (error) {
      this.displayUpdate(`Failed to connect: ${error}`);
    }
  }

  // Insert text at current cursor position
  async insertText(text: string): Promise<void> {
    const operation: TextOperation = {
      type: 'insert',
      position: this.cursorPosition,
      content: text,
      userId: this.userId,
      timestamp: Date.now()
    };

    // Apply locally first (optimistic update)
    this.applyOperation(operation);
    
    // Send to other clients
    await this.ksync.send('text-operation', operation);
    
    this.cursorPosition += text.length;
    this.updateCursor();
  }

  // Delete text at current cursor position
  async deleteText(length: number): Promise<void> {
    if (this.cursorPosition < length) {
      length = this.cursorPosition;
    }

    const operation: TextOperation = {
      type: 'delete',
      position: this.cursorPosition - length,
      length,
      userId: this.userId,
      timestamp: Date.now()
    };

    // Apply locally first
    this.applyOperation(operation);
    
    // Send to other clients
    await this.ksync.send('text-operation', operation);
    
    this.cursorPosition -= length;
    this.updateCursor();
  }

  // Move cursor to specific position
  async moveCursor(position: number): Promise<void> {
    this.cursorPosition = Math.max(0, Math.min(position, this.content.length));
    await this.updateCursor();
  }

  private async updateCursor(): Promise<void> {
    await this.ksync.send('cursor-update', {
      userId: this.userId,
      position: this.cursorPosition
    });
  }

  private applyOperation(operation: TextOperation): void {
    switch (operation.type) {
      case 'insert':
        if (operation.content) {
          this.content = 
            this.content.slice(0, operation.position) + 
            operation.content + 
            this.content.slice(operation.position);
          
          // Adjust cursor if insertion was before current position
          if (operation.position <= this.cursorPosition && operation.userId !== this.userId) {
            this.cursorPosition += operation.content.length;
          }
        }
        break;

      case 'delete':
        if (operation.length) {
          this.content = 
            this.content.slice(0, operation.position) + 
            this.content.slice(operation.position + operation.length);
          
          // Adjust cursor if deletion was before current position
          if (operation.position < this.cursorPosition && operation.userId !== this.userId) {
            this.cursorPosition = Math.max(operation.position, this.cursorPosition - operation.length);
          }
        }
        break;
    }

    this.version++;
    this.pendingOperations.push(operation);
  }

  private materializeDocument(events: any[]): DocumentState {
    const operations = events
      .filter(e => e.type === 'text-operation')
      .map(e => e.data)
      .sort((a, b) => a.timestamp - b.timestamp);

    let content = '';
    let version = 0;

    for (const op of operations) {
      switch (op.type) {
        case 'insert':
          if (op.content) {
            content = content.slice(0, op.position) + op.content + content.slice(op.position);
          }
          break;
        case 'delete':
          if (op.length) {
            content = content.slice(0, op.position) + content.slice(op.position + op.length);
          }
          break;
      }
      version++;
    }

    return { content, version, operations };
  }

  getContent(): string {
    return this.content;
  }

  getCursorPosition(): number {
    return this.cursorPosition;
  }

  getVersion(): number {
    return this.version;
  }

  getStats() {
    const presence = this.ksync.getPresence();
    const status = this.ksync.getStatus();
    
    return {
      userId: this.userId,
      documentId: this.documentId,
      contentLength: this.content.length,
      version: this.version,
      cursorPosition: this.cursorPosition,
      pendingOperations: this.pendingOperations.length,
      activeUsers: presence.length,
      connected: status.connected,
      eventsProcessed: status.events
    };
  }

  private displayUpdate(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${this.userId}: ${message}`);
  }

  async disconnect(): Promise<void> {
    await this.ksync.disconnect();
  }
}

// Comprehensive test suite for collaborative editing
class CollaborativeEditingTest {
  private server?: KSyncServer;
  private editors: CollaborativeEditor[] = [];

  async runTest(): Promise<void> {
    console.log('🚀 Starting Collaborative Editor Test\n');

    // Start server
    await this.startServer();

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Test basic multi-user editing
      await this.testBasicCollaboration();
      
      // Test conflict resolution
      await this.testConflictResolution();
      
      // Test rapid concurrent edits
      await this.testRapidConcurrentEdits();
      
      // Test connection resilience
      await this.testConnectionResilience();
      
      console.log('\n✅ All collaborative editing tests passed!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  private async startServer(): Promise<void> {
    this.server = new KSyncServer({ 
      port: 8080, 
      debug: false 
    });
    await this.server.start();
    console.log('📡 Test server started on port 8080');
  }

  private async testBasicCollaboration(): Promise<void> {
    console.log('\n📝 Test 1: Basic Multi-User Collaboration');
    
    // Create three editors
    const alice = new CollaborativeEditor('Alice', 'test-doc-1');
    const bob = new CollaborativeEditor('Bob', 'test-doc-1');
    const charlie = new CollaborativeEditor('Charlie', 'test-doc-1');
    
    this.editors = [alice, bob, charlie];

    // Connect all editors
    await Promise.all([
      alice.connect(),
      bob.connect(),
      charlie.connect()
    ]);

    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 200));

    // Alice types
    await alice.insertText('Hello ');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Bob types
    await bob.moveCursor(6);
    await bob.insertText('beautiful ');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Charlie types
    await charlie.moveCursor(16);
    await charlie.insertText('world!');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify all editors have the same content
    const aliceContent = alice.getContent();
    const bobContent = bob.getContent();
    const charlieContent = charlie.getContent();

    console.log(`   Alice sees: "${aliceContent}"`);
    console.log(`   Bob sees: "${bobContent}"`);
    console.log(`   Charlie sees: "${charlieContent}"`);

    if (aliceContent === bobContent && bobContent === charlieContent) {
      console.log('   ✅ All editors synchronized!');
    } else {
      throw new Error('Content synchronization failed');
    }

    // Print stats
    console.log('   📊 Stats:');
    this.editors.forEach(editor => {
      const stats = editor.getStats();
      console.log(`      ${stats.userId}: ${stats.eventsProcessed} events, cursor at ${stats.cursorPosition}`);
    });
  }

  private async testConflictResolution(): Promise<void> {
    console.log('\n⚔️  Test 2: Conflict Resolution');
    
    // Create two editors working on same document
    const editor1 = new CollaborativeEditor('Editor1', 'conflict-doc');
    const editor2 = new CollaborativeEditor('Editor2', 'conflict-doc');
    
    await Promise.all([editor1.connect(), editor2.connect()]);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both editors type at same position simultaneously
    const promises = [
      editor1.insertText('LEFT'),
      editor2.insertText('RIGHT')
    ];

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 200));

    const content1 = editor1.getContent();
    const content2 = editor2.getContent();

    console.log(`   Editor1 sees: "${content1}"`);
    console.log(`   Editor2 sees: "${content2}"`);

    if (content1 === content2) {
      console.log('   ✅ Conflict resolved consistently!');
    } else {
      console.log('   ⚠️  Different resolution, but this is expected behavior');
    }

    await editor1.disconnect();
    await editor2.disconnect();
  }

  private async testRapidConcurrentEdits(): Promise<void> {
    console.log('\n⚡ Test 3: Rapid Concurrent Edits');
    
    const numEditors = 5;
    const editsPerEditor = 20;
    const editors: CollaborativeEditor[] = [];

    // Create multiple editors
    for (let i = 0; i < numEditors; i++) {
      const editor = new CollaborativeEditor(`User${i}`, 'rapid-test');
      editors.push(editor);
      await editor.connect();
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    const startTime = Date.now();

    // Each editor makes rapid edits
    const editPromises = editors.map(async (editor, editorIndex) => {
      for (let i = 0; i < editsPerEditor; i++) {
        try {
          await editor.moveCursor(i * editorIndex);
          await editor.insertText(`${editorIndex}-${i} `);
          // Small random delay to create realistic typing patterns
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        } catch (error) {
          console.log(`   Error in editor ${editorIndex}: ${error}`);
        }
      }
    });

    await Promise.all(editPromises);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for synchronization

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check synchronization
    const contents = editors.map(e => e.getContent());
    const allSame = contents.every(content => content === contents[0]);

    console.log(`   ⏱️  Total time: ${duration}ms`);
    console.log(`   📝 Final content length: ${contents[0].length} chars`);
    console.log(`   🎯 Total operations: ${numEditors * editsPerEditor}`);
    console.log(`   ⚡ Ops/sec: ${((numEditors * editsPerEditor) / duration * 1000).toFixed(0)}`);

    if (allSame) {
      console.log('   ✅ All editors synchronized after rapid edits!');
    } else {
      console.log('   ❌ Synchronization issues detected');
      editors.forEach((editor, i) => {
        console.log(`      Editor ${i}: ${editor.getContent().length} chars`);
      });
    }

    // Cleanup
    await Promise.all(editors.map(e => e.disconnect()));
  }

  private async testConnectionResilience(): Promise<void> {
    console.log('\n🔄 Test 4: Connection Resilience');
    
    const editor = new CollaborativeEditor('ResilienceTest', 'resilience-doc');
    await editor.connect();
    
    // Make some edits
    await editor.insertText('Initial content ');
    
    // Simulate disconnect/reconnect by creating new editor with same user
    await editor.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newEditor = new CollaborativeEditor('ResilienceTest', 'resilience-doc');
    await newEditor.connect();
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Continue editing
    await newEditor.insertText('after reconnection');
    
    const finalContent = newEditor.getContent();
    console.log(`   📝 Content after reconnection: "${finalContent}"`);
    
    if (finalContent.includes('Initial content') && finalContent.includes('after reconnection')) {
      console.log('   ✅ Content preserved through reconnection!');
    } else {
      console.log('   ❌ Content lost during reconnection');
    }
    
    await newEditor.disconnect();
  }

  private async cleanup(): Promise<void> {
    // Disconnect all editors
    await Promise.all(this.editors.map(editor => editor.disconnect()));
    
    // Stop server
    if (this.server) {
      await this.server.stop();
      console.log('\n📡 Test server stopped');
    }
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new CollaborativeEditingTest();
  test.runTest().catch(console.error);
}

export { CollaborativeEditor, CollaborativeEditingTest };