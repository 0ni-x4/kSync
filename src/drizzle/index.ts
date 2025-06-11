import { KSyncEvent } from '../types.js';
import { CRDTValue, CRDTFactory } from '../crdt/index.js';

export interface DrizzleConfig {
  storeName: string;
  crdtMode?: boolean;
  schema?: any;
}

export interface QueryResult<T = any> {
  data: T[];
  count: number;
  hasMore: boolean;
}

export interface WhereClause {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: any;
}

export interface OrderClause {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryBuilder<T> {
  where(clause: WhereClause): QueryBuilder<T>;
  orderBy(order: OrderClause): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  select(fields?: (keyof T)[]): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
}

export class DrizzleKSyncAdapter {
  private events: KSyncEvent[] = [];
  private materializedViews: Map<string, any[]> = new Map();
  private crdtStates: Map<string, CRDTValue> = new Map();

  constructor(private config: DrizzleConfig) {}

  // Update events from kSync
  updateEvents(events: KSyncEvent[]): void {
    this.events = events;
    this.invalidateViews();
  }

  // Create a table-like interface
  table<T = any>(name: string): DrizzleTable<T> {
    return new DrizzleTable<T>(name, this, this.config);
  }

  // Get materialized view or compute it
  getMaterializedView(tableName: string): any[] {
    if (!this.materializedViews.has(tableName)) {
      const data = this.computeTableData(tableName);
      this.materializedViews.set(tableName, data);
    }
    return this.materializedViews.get(tableName)!;
  }

  // Compute table data from events
  private computeTableData(tableName: string): any[] {
    const relevantEvents = this.events.filter(event => 
      event.type.startsWith(`${tableName}:`) || event.type === tableName
    );

    if (this.config.crdtMode) {
      return this.computeCRDTTableData(tableName, relevantEvents);
    }

    return this.computeEventSourcingTableData(tableName, relevantEvents);
  }

  private computeCRDTTableData(tableName: string, events: KSyncEvent[]): any[] {
    const records: Map<string, any> = new Map();

    for (const event of events) {
      const { data } = event;
      
      if (!data.id) continue;

      let record = records.get(data.id);
      if (!record) {
        record = { id: data.id };
        records.set(data.id, record);
      }

      // Merge CRDT values
      for (const [field, value] of Object.entries(data)) {
        if (field === 'id') continue;

        if (value && typeof value === 'object' && (value as any).__crdtType) {
          const crdtValue = CRDTFactory.fromJSON(value);
          const existing = record[field];
          
          if (existing && (existing as any).__crdtType) {
            const existingCRDT = CRDTFactory.fromJSON(existing);
            record[field] = existingCRDT.merge(crdtValue).toJSON();
          } else {
            record[field] = crdtValue.toJSON();
          }
        } else {
          // Regular value - use timestamp for LWW
          if (!record[field] || event.timestamp > (record[`__${field}_timestamp`] || 0)) {
            record[field] = value;
            record[`__${field}_timestamp`] = event.timestamp;
          }
        }
      }
    }

    return Array.from(records.values()).map(record => {
      // Clean up timestamp metadata and convert CRDT values
      const cleaned: any = { id: record.id };
      for (const [key, value] of Object.entries(record)) {
        if (key.startsWith('__') && key.endsWith('_timestamp')) continue;
        
        if (value && typeof value === 'object' && (value as any).__crdtType) {
          const crdt = CRDTFactory.fromJSON(value);
          // Extract the actual value based on CRDT type
          if (crdt.__crdtType === 'LWWRegister') {
            cleaned[key] = (crdt as any).value;
          } else if (crdt.__crdtType === 'GSet') {
            cleaned[key] = Array.from((crdt as any).elements);
          } else if (crdt.__crdtType === 'GCounter') {
            cleaned[key] = (crdt as any).value();
          } else {
            cleaned[key] = value;
          }
        } else {
          cleaned[key] = value;
        }
      }
      return cleaned;
    });
  }

  private computeEventSourcingTableData(tableName: string, events: KSyncEvent[]): any[] {
    const records: Map<string, any> = new Map();

    for (const event of events) {
      const { type, data, timestamp } = event;

      if (type === `${tableName}:created` || type === `${tableName}:insert`) {
        records.set(data.id, { ...data, __created: timestamp, __updated: timestamp });
      } else if (type === `${tableName}:updated` || type === `${tableName}:update`) {
        const existing = records.get(data.id);
        if (existing) {
          records.set(data.id, { ...existing, ...data, __updated: timestamp });
        }
      } else if (type === `${tableName}:deleted` || type === `${tableName}:delete`) {
        records.delete(data.id);
      }
    }

    return Array.from(records.values());
  }

  private invalidateViews(): void {
    this.materializedViews.clear();
  }
}

export class DrizzleTable<T> {
  constructor(
    private name: string,
    private adapter: DrizzleKSyncAdapter,
    private config: DrizzleConfig
  ) {}

  // Query builder
  query(): QueryBuilder<T> {
    return new DrizzleQueryBuilder<T>(this.name, this.adapter);
  }

  // Convenience methods
  async findMany(options: {
    where?: Partial<T>;
    orderBy?: { [K in keyof T]?: 'asc' | 'desc' };
    limit?: number;
    offset?: number;
  } = {}): Promise<T[]> {
    let query = this.query();

    if (options.where) {
      for (const [field, value] of Object.entries(options.where)) {
        query = query.where({ field, operator: 'eq', value });
      }
    }

    if (options.orderBy) {
      for (const [field, direction] of Object.entries(options.orderBy)) {
        query = query.orderBy({ field, direction: direction as 'asc' | 'desc' });
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    const result = await query.execute();
    return result.data;
  }

  async findFirst(where: Partial<T>): Promise<T | null> {
    const results = await this.findMany({ where, limit: 1 });
    return results[0] || null;
  }

  async findById(id: string): Promise<T | null> {
    return this.findFirst({ id } as unknown as Partial<T>);
  }

  async count(where?: Partial<T>): Promise<number> {
    const results = await this.findMany({ where });
    return results.length;
  }
}

export class DrizzleQueryBuilder<T> implements QueryBuilder<T> {
  private whereClauses: WhereClause[] = [];
  private orderClauses: OrderClause[] = [];
  private limitCount?: number;
  private offsetCount: number = 0;
  private selectFields?: (keyof T)[];

  constructor(
    private tableName: string,
    private adapter: DrizzleKSyncAdapter
  ) {}

  where(clause: WhereClause): QueryBuilder<T> {
    this.whereClauses.push(clause);
    return this;
  }

  orderBy(order: OrderClause): QueryBuilder<T> {
    this.orderClauses.push(order);
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.limitCount = count;
    return this;
  }

  offset(count: number): QueryBuilder<T> {
    this.offsetCount = count;
    return this;
  }

  select(fields?: (keyof T)[]): QueryBuilder<T> {
    this.selectFields = fields;
    return this;
  }

  async execute(): Promise<QueryResult<T>> {
    let data = this.adapter.getMaterializedView(this.tableName);

    // Apply where clauses
    for (const clause of this.whereClauses) {
      data = this.applyWhereClause(data, clause);
    }

    const totalCount = data.length;

    // Apply ordering
    for (const order of this.orderClauses) {
      data = this.applyOrderClause(data, order);
    }

    // Apply offset and limit
    const start = this.offsetCount;
    const end = this.limitCount ? start + this.limitCount : undefined;
    data = data.slice(start, end);

    // Apply field selection
    if (this.selectFields) {
      data = data.map(record => {
        const selected: any = {};
        for (const field of this.selectFields!) {
          selected[field] = record[field as string];
        }
        return selected;
      });
    }

    return {
      data: data as T[],
      count: totalCount,
      hasMore: this.limitCount ? start + this.limitCount < totalCount : false
    };
  }

  private applyWhereClause(data: any[], clause: WhereClause): any[] {
    return data.filter(record => {
      const fieldValue = record[clause.field];
      
      switch (clause.operator) {
        case 'eq':
          return fieldValue === clause.value;
        case 'ne':
          return fieldValue !== clause.value;
        case 'gt':
          return fieldValue > clause.value;
        case 'gte':
          return fieldValue >= clause.value;
        case 'lt':
          return fieldValue < clause.value;
        case 'lte':
          return fieldValue <= clause.value;
        case 'in':
          return Array.isArray(clause.value) && clause.value.includes(fieldValue);
        case 'like':
          return typeof fieldValue === 'string' && 
                 typeof clause.value === 'string' &&
                 fieldValue.toLowerCase().includes(clause.value.toLowerCase());
        default:
          return true;
      }
    });
  }

  private applyOrderClause(data: any[], order: OrderClause): any[] {
    return [...data].sort((a, b) => {
      const aValue = a[order.field];
      const bValue = b[order.field];
      
      if (aValue < bValue) return order.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return order.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }
} 