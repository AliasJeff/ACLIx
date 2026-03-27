export interface MemoryRecord {
  key: string;
  value: string;
}

export class LocalDatabase {
  private readonly store = new Map<string, string>();

  upsert(record: MemoryRecord): void {
    this.store.set(record.key, record.value);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }
}
