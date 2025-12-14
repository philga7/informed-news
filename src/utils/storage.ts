import type { AppState } from '../types';

const STATE_KEY_PREFIX = 'news-state';
const DEMO_STATE_KEY = 'news-demo-state';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024;

interface SerializedDate {
  __type: 'Date';
  value: string;
}

export function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    console.error('localStorage not available:', error);
    return false;
  }
}

function serializeDates(obj: unknown): unknown {
  if (obj instanceof Date) {
    return { __type: 'Date', value: obj.toISOString() } as SerializedDate;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeDates);
  }

  if (typeof obj === 'object' && obj !== null) {
    const serialized: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        serialized[key] = serializeDates((obj as Record<string, unknown>)[key]);
      }
    }
    return serialized;
  }

  return obj;
}

function deserializeDates(obj: unknown): unknown {
  if (
    typeof obj === 'object' &&
    obj !== null &&
    '__type' in obj &&
    obj.__type === 'Date' &&
    'value' in obj &&
    typeof obj.value === 'string'
  ) {
    return new Date(obj.value);
  }

  if (Array.isArray(obj)) {
    return obj.map(deserializeDates);
  }

  if (typeof obj === 'object' && obj !== null) {
    const deserialized: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        deserialized[key] = deserializeDates((obj as Record<string, unknown>)[key]);
      }
    }
    return deserialized;
  }

  return obj;
}

function getStorageKey(userId?: string): string {
  if (!userId) {
    return DEMO_STATE_KEY;
  }
  return `${STATE_KEY_PREFIX}-${userId}`;
}

export function saveToStorage(state: AppState, userId?: string): void {
  if (!isStorageAvailable()) {
    console.warn('Storage not available, cannot save state');
    return;
  }

  try {
    const serialized = serializeDates(state);
    const stateJson = JSON.stringify(serialized);

    if (stateJson.length > MAX_STORAGE_SIZE) {
      console.warn('State exceeds maximum storage size');
      throw new Error('Storage quota exceeded');
    }

    const key = getStorageKey(userId);
    localStorage.setItem(key, stateJson);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('Storage quota exceeded');
      throw new Error('Storage quota exceeded. Please clear some data.');
    }
    console.error('Error saving state:', error);
    throw error;
  }
}

export function loadFromStorage(userId?: string): AppState | null {
  if (!isStorageAvailable()) {
    console.warn('Storage not available, cannot load state');
    return null;
  }

  try {
    const key = getStorageKey(userId);
    const stateJson = localStorage.getItem(key);

    if (!stateJson) {
      return null;
    }

    const parsed = JSON.parse(stateJson);
    const deserialized = deserializeDates(parsed);

    return deserialized as AppState;
  } catch (error) {
    console.error('Error loading state, clearing corrupted data:', error);
    clearStorage(userId);
    return null;
  }
}

export function clearStorage(userId?: string): void {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    const key = getStorageKey(userId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
}

export function getStorageSize(userId?: string): number {
  if (!isStorageAvailable()) {
    return 0;
  }

  try {
    const key = getStorageKey(userId);
    const data = localStorage.getItem(key);
    return data ? data.length : 0;
  } catch (error) {
    console.error('Error getting storage size:', error);
    return 0;
  }
}
