export interface CRDTValue {
  readonly __crdtType: string;
  merge(other: CRDTValue): CRDTValue;
  equals(other: CRDTValue): boolean;
  toJSON(): any;
}

export interface VectorClock {
  [clientId: string]: number;
}

export interface CRDTEvent {
  id: string;
  type: string;
  data: any;
  vectorClock: VectorClock;
  timestamp: number;
  clientId: string;
}

// Last Write Wins Register (LWWRegister)
export class LWWRegister<T> implements CRDTValue {
  readonly __crdtType = 'LWWRegister';

  constructor(
    public value: T,
    public timestamp: number,
    public clientId: string
  ) {}

  merge(other: CRDTValue): LWWRegister<T> {
    if (other.__crdtType !== 'LWWRegister') {
      throw new Error('Cannot merge different CRDT types');
    }

    const otherReg = other as LWWRegister<T>;
    
    // Use timestamp for ordering, clientId as tiebreaker
    if (otherReg.timestamp > this.timestamp || 
        (otherReg.timestamp === this.timestamp && otherReg.clientId > this.clientId)) {
      return otherReg;
    }
    
    return this;
  }

  equals(other: CRDTValue): boolean {
    if (other.__crdtType !== 'LWWRegister') return false;
    const otherReg = other as LWWRegister<T>;
    return this.value === otherReg.value && 
           this.timestamp === otherReg.timestamp && 
           this.clientId === otherReg.clientId;
  }

  toJSON() {
    return {
      __crdtType: this.__crdtType,
      value: this.value,
      timestamp: this.timestamp,
      clientId: this.clientId
    };
  }
}

// Grow-only Set (G-Set)
export class GSet<T> implements CRDTValue {
  readonly __crdtType = 'GSet';

  constructor(public elements: Set<T> = new Set()) {}

  add(element: T): GSet<T> {
    const newSet = new Set(this.elements);
    newSet.add(element);
    return new GSet(newSet);
  }

  has(element: T): boolean {
    return this.elements.has(element);
  }

  merge(other: CRDTValue): GSet<T> {
    if (other.__crdtType !== 'GSet') {
      throw new Error('Cannot merge different CRDT types');
    }

    const otherSet = other as GSet<T>;
    const merged = new Set([...this.elements, ...otherSet.elements]);
    return new GSet(merged);
  }

  equals(other: CRDTValue): boolean {
    if (other.__crdtType !== 'GSet') return false;
    const otherSet = other as GSet<T>;
    
    if (this.elements.size !== otherSet.elements.size) return false;
    
    for (const element of this.elements) {
      if (!otherSet.elements.has(element)) return false;
    }
    
    return true;
  }

  toJSON() {
    return {
      __crdtType: this.__crdtType,
      elements: Array.from(this.elements)
    };
  }
}

// G-Counter (Grow-only Counter)
export class GCounter implements CRDTValue {
  readonly __crdtType = 'GCounter';

  constructor(public counters: Map<string, number> = new Map()) {}

  increment(clientId: string, amount: number = 1): GCounter {
    const newCounters = new Map(this.counters);
    const current = newCounters.get(clientId) || 0;
    newCounters.set(clientId, current + amount);
    return new GCounter(newCounters);
  }

  value(): number {
    let total = 0;
    for (const count of this.counters.values()) {
      total += count;
    }
    return total;
  }

  merge(other: CRDTValue): GCounter {
    if (other.__crdtType !== 'GCounter') {
      throw new Error('Cannot merge different CRDT types');
    }

    const otherCounter = other as GCounter;
    const merged = new Map(this.counters);

    for (const [clientId, count] of otherCounter.counters) {
      const currentCount = merged.get(clientId) || 0;
      merged.set(clientId, Math.max(currentCount, count));
    }

    return new GCounter(merged);
  }

  equals(other: CRDTValue): boolean {
    if (other.__crdtType !== 'GCounter') return false;
    const otherCounter = other as GCounter;
    
    if (this.counters.size !== otherCounter.counters.size) return false;
    
    for (const [clientId, count] of this.counters) {
      if (otherCounter.counters.get(clientId) !== count) return false;
    }
    
    return true;
  }

  toJSON() {
    return {
      __crdtType: this.__crdtType,
      counters: Object.fromEntries(this.counters)
    };
  }
}

// CRDT-aware Map
export class CRDTMap implements CRDTValue {
  readonly __crdtType = 'CRDTMap';

  constructor(public values: Map<string, CRDTValue> = new Map()) {}

  set(key: string, value: CRDTValue): CRDTMap {
    const newValues = new Map(this.values);
    newValues.set(key, value);
    return new CRDTMap(newValues);
  }

  get(key: string): CRDTValue | undefined {
    return this.values.get(key);
  }

  merge(other: CRDTValue): CRDTMap {
    if (other.__crdtType !== 'CRDTMap') {
      throw new Error('Cannot merge different CRDT types');
    }

    const otherMap = other as CRDTMap;
    const merged = new Map(this.values);

    for (const [key, value] of otherMap.values) {
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, existing.merge(value));
      } else {
        merged.set(key, value);
      }
    }

    return new CRDTMap(merged);
  }

  equals(other: CRDTValue): boolean {
    if (other.__crdtType !== 'CRDTMap') return false;
    const otherMap = other as CRDTMap;
    
    if (this.values.size !== otherMap.values.size) return false;
    
    for (const [key, value] of this.values) {
      const otherValue = otherMap.values.get(key);
      if (!otherValue || !value.equals(otherValue)) return false;
    }
    
    return true;
  }

  toJSON() {
    const obj: any = { __crdtType: this.__crdtType, values: {} };
    for (const [key, value] of this.values) {
      obj.values[key] = value.toJSON();
    }
    return obj;
  }
}

// Vector Clock utilities
export class VectorClockUtil {
  static create(clientId: string): VectorClock {
    return { [clientId]: 1 };
  }

  static increment(clock: VectorClock, clientId: string): VectorClock {
    return {
      ...clock,
      [clientId]: (clock[clientId] || 0) + 1
    };
  }

  static merge(clock1: VectorClock, clock2: VectorClock): VectorClock {
    const merged: VectorClock = { ...clock1 };
    
    for (const [clientId, timestamp] of Object.entries(clock2)) {
      merged[clientId] = Math.max(merged[clientId] || 0, timestamp);
    }
    
    return merged;
  }

  static compare(clock1: VectorClock, clock2: VectorClock): 'before' | 'after' | 'concurrent' {
    let hasGreater = false;
    let hasLess = false;

    const allClientIds = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

    for (const clientId of allClientIds) {
      const time1 = clock1[clientId] || 0;
      const time2 = clock2[clientId] || 0;

      if (time1 > time2) hasGreater = true;
      if (time1 < time2) hasLess = true;
    }

    if (hasGreater && hasLess) return 'concurrent';
    if (hasGreater) return 'after';
    if (hasLess) return 'before';
    return 'concurrent'; // equal
  }
}

// CRDT Factory
export class CRDTFactory {
  static fromJSON(data: any): CRDTValue {
    switch (data.__crdtType) {
      case 'LWWRegister':
        return new LWWRegister(data.value, data.timestamp, data.clientId);
      
      case 'GSet':
        return new GSet(new Set(data.elements));
      
      case 'GCounter':
        return new GCounter(new Map(Object.entries(data.counters)));
      
      case 'CRDTMap':
        const map = new Map();
        for (const [key, value] of Object.entries(data.values)) {
          map.set(key, CRDTFactory.fromJSON(value));
        }
        return new CRDTMap(map);
      
      default:
        throw new Error(`Unknown CRDT type: ${data.__crdtType}`);
    }
  }
} 