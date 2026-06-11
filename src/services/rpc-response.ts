import type { UUID } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractId(data: unknown, keys: string[]): UUID | null {
  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const id = extractId(item, keys);
      if (id) {
        return id;
      }
    }
    return null;
  }

  if (isRecord(data)) {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return null;
}
