#!/usr/bin/env tsx

import { KSync, createKSync, createChat, createAI, createGame } from '../src/core';
import { MemoryStorage } from '../src/storage/memory';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  averageLatency: number;
  memoryUsage: number;
  errors: number;
  duration: number;
}

class RealBenchmark {
  private results: BenchmarkResult[] = [];

  async runAllBenchmarks(): Promise<void> {
    console.log('🚀 Running REAL Performance Benchmarks\n');
    console.log('='.repeat(50));

    // Basic event throughput
    await this.benchmarkBasicEvents();
    
    // Event batching performance
    await this.benchmarkEventBatching();
    
    // State materialization performance
    await this.benchmarkStateMaterialization();
    
    // Memory efficiency
    await this.benchmarkMemoryEfficiency();
    
    // Concurrent operations
    await this.benchmarkConcurrentOperations();
    
    // Factory function performance
    await this.benchmarkFactoryFunctions();
    
    // Large dataset handling
    await this.benchmarkLargeDatasets();
    
    this.printSummary();
  }

  private async benchmarkBasicEvents(): Promise<void> {
    console.log('\n📊 Basic Event Throughput Test');
    
    const ksync = createKSync({
      storage: { instance: new MemoryStorage({ maxEvents: 50000 }) },
      performance: { batchSize: 100, batchDelay: 1 },
      debug: false
    });

    const eventCount = 10000;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    try {
      const promises = Array.from({ length: eventCount }, (_, i) =>
        ksync.send('benchmark-event', { 
          index: i, 
          data: `test-data-${i}`,
          timestamp: Date.now()
        }).catch(() => errors++)
      );
      
      await Promise.all(promises);
      
      // Wait for all batching to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      errors++;
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const result: BenchmarkResult = {
      name: 'Basic Event Throughput',
      opsPerSecond: (eventCount / duration) * 1000,
      averageLatency: duration / eventCount,
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private async benchmarkEventBatching(): Promise<void> {
    console.log('\n📊 Event Batching Performance');
    
    const ksync = createKSync({
      storage: { instance: new MemoryStorage() },
      performance: { batchSize: 50, batchDelay: 5 },
      debug: false
    });

    const eventCount = 5000;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    // Send events rapidly to test batching
    for (let i = 0; i < eventCount; i++) {
      try {
        await ksync.send('batch-test', { id: i, data: Math.random() });
      } catch (error) {
        errors++;
      }
    }
    
    // Wait for batching to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const result: BenchmarkResult = {
      name: 'Event Batching',
      opsPerSecond: (eventCount / duration) * 1000,
      averageLatency: duration / eventCount,
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private async benchmarkStateMaterialization(): Promise<void> {
    console.log('\n📊 State Materialization Performance');
    
    const eventCount = 1000;
    const events: any[] = [];
    
    // Create test events
    for (let i = 0; i < eventCount; i++) {
      events.push({
        id: `event-${i}`,
        type: i % 2 === 0 ? 'increment' : 'decrement',
        data: { value: Math.floor(Math.random() * 10) + 1 },
        timestamp: Date.now() + i,
        version: i + 1,
        userId: 'test-user'
      });
    }
    
    const materializer = (events: any[]) => {
      return events.reduce((state, event) => {
        if (event.type === 'increment') {
          return { ...state, count: (state.count || 0) + event.data.value };
        } else if (event.type === 'decrement') {
          return { ...state, count: (state.count || 0) - event.data.value };
        }
        return state;
      }, { count: 0 });
    };

    const iterations = 1000;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    for (let i = 0; i < iterations; i++) {
      try {
        materializer(events);
      } catch (error) {
        errors++;
      }
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const result: BenchmarkResult = {
      name: 'State Materialization',
      opsPerSecond: (iterations / duration) * 1000,
      averageLatency: duration / iterations,
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private async benchmarkMemoryEfficiency(): Promise<void> {
    console.log('\n📊 Memory Efficiency Test');
    
    const storage = new MemoryStorage({ 
      maxEvents: 1000,
      maxMemoryMB: 10,
      trimOnLimit: true
    });

    const eventCount = 2000; // More than maxEvents to test trimming
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    for (let i = 0; i < eventCount; i++) {
      try {
        await storage.storeEvent({
          id: `event-${i}`,
          type: 'memory-test',
          data: { 
            index: i,
            payload: 'x'.repeat(100) // 100 chars per event
          },
          timestamp: Date.now(),
          version: i + 1,
          userId: 'test-user'
        });
      } catch (error) {
        errors++;
      }
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const stats = storage.getStats();
    
    const result: BenchmarkResult = {
      name: 'Memory Efficiency',
      opsPerSecond: (eventCount / duration) * 1000,
      averageLatency: duration / eventCount,
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
    
    console.log(`   📈 Storage Stats: ${stats.eventCount} events, ${stats.memoryUsageMB.toFixed(2)}MB`);
    console.log(`   📊 Memory Utilization: ${stats.memoryUtilization.toFixed(1)}%`);
  }

  private async benchmarkConcurrentOperations(): Promise<void> {
    console.log('\n📊 Concurrent Operations Test');
    
    const ksync = createKSync({
      storage: { instance: new MemoryStorage() },
      performance: { batchSize: 50, batchDelay: 10 },
      debug: false
    });

    const concurrentClients = 10;
    const eventsPerClient = 100;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let totalErrors = 0;
    
    const clientPromises = Array.from({ length: concurrentClients }, async (_, clientId) => {
      let errors = 0;
      for (let i = 0; i < eventsPerClient; i++) {
        try {
          await ksync.send('concurrent-test', {
            clientId,
            eventId: i,
            data: `client-${clientId}-event-${i}`
          });
        } catch (error) {
          errors++;
        }
      }
      return errors;
    });
    
    const errorCounts = await Promise.all(clientPromises);
    totalErrors = errorCounts.reduce((sum, count) => sum + count, 0);
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    const totalOperations = concurrentClients * eventsPerClient;
    
    const result: BenchmarkResult = {
      name: 'Concurrent Operations',
      opsPerSecond: (totalOperations / duration) * 1000,
      averageLatency: duration / totalOperations,
      memoryUsage: endMemory - startMemory,
      errors: totalErrors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private async benchmarkFactoryFunctions(): Promise<void> {
    console.log('\n📊 Factory Functions Performance');
    
    const iterations = 1000;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    for (let i = 0; i < iterations; i++) {
      try {
        const chat = createChat(`room-${i}`);
        const ai = createAI(`ai-${i}`);
        const game = createGame(`game-${i}`);
        
        // Send a test event to each
        await Promise.all([
          chat.send('test', { data: i }),
          ai.send('test', { data: i }),
          game.send('test', { data: i })
        ]);
      } catch (error) {
        errors++;
      }
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const result: BenchmarkResult = {
      name: 'Factory Functions',
      opsPerSecond: (iterations * 3 / duration) * 1000, // 3 operations per iteration
      averageLatency: duration / (iterations * 3),
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private async benchmarkLargeDatasets(): Promise<void> {
    console.log('\n📊 Large Dataset Handling');
    
    const ksync = createKSync({
      storage: { instance: new MemoryStorage({ maxEvents: 100000 }) },
      performance: { batchSize: 200, batchDelay: 5 },
      debug: false
    });

    const eventCount = 50000;
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    let errors = 0;
    
    // Create larger payloads
    const basePayload = 'x'.repeat(1000); // 1KB per event
    
    for (let i = 0; i < eventCount; i++) {
      try {
        await ksync.send('large-data-test', {
          id: i,
          payload: basePayload,
          metadata: {
            timestamp: Date.now(),
            index: i,
            batch: Math.floor(i / 1000)
          }
        });
        
        // Add small delay every 1000 events to prevent overwhelming
        if (i % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
      } catch (error) {
        errors++;
      }
    }
    
    // Wait for all batching to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;
    
    const result: BenchmarkResult = {
      name: 'Large Dataset Handling',
      opsPerSecond: (eventCount / duration) * 1000,
      averageLatency: duration / eventCount,
      memoryUsage: endMemory - startMemory,
      errors,
      duration
    };
    
    this.results.push(result);
    this.printResult(result);
  }

  private printResult(result: BenchmarkResult): void {
    console.log(`   ⚡ ${result.opsPerSecond.toLocaleString()} ops/sec`);
    console.log(`   ⏱️  ${result.averageLatency.toFixed(3)}ms avg latency`);
    console.log(`   💾 ${(result.memoryUsage / 1024 / 1024).toFixed(2)}MB memory`);
    console.log(`   ❌ ${result.errors} errors`);
    console.log(`   🕐 ${result.duration.toFixed(2)}ms total time`);
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 REAL BENCHMARK SUMMARY');
    console.log('='.repeat(50));
    
    const totalOps = this.results.reduce((sum, r) => sum + r.opsPerSecond, 0);
    const avgOps = totalOps / this.results.length;
    const totalErrors = this.results.reduce((sum, r) => sum + r.errors, 0);
    const totalMemory = this.results.reduce((sum, r) => sum + r.memoryUsage, 0);
    
    console.log(`🎯 Average Performance: ${avgOps.toLocaleString()} ops/sec`);
    console.log(`💾 Total Memory Used: ${(totalMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`❌ Total Errors: ${totalErrors}`);
    
    console.log('\n📈 Individual Results:');
    this.results.forEach(result => {
      console.log(`   ${result.name}: ${result.opsPerSecond.toLocaleString()} ops/sec`);
    });
    
    // Reality check
    const maxOps = Math.max(...this.results.map(r => r.opsPerSecond));
    console.log('\n🔍 Reality Check:');
    console.log(`   Peak Performance: ${maxOps.toLocaleString()} ops/sec`);
    
    if (maxOps > 300000) {
      console.log('   ✅ Claims of 300k+ ops/sec are VERIFIED!');
    } else {
      console.log('   ❌ Claims of 300k+ ops/sec are UNVERIFIED');
      console.log(`   📉 Actual peak: ${maxOps.toLocaleString()} ops/sec`);
    }
    
    console.log('\n🎉 Real benchmarking complete!');
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new RealBenchmark();
  benchmark.runAllBenchmarks().catch(console.error);
}

export { RealBenchmark };