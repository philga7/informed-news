import { inject, vi } from 'vitest';

// Make vi available globally
(global as any).vi = vi;

// Store the original fetch
const originalFetch = global.fetch;
const kiteBaseUrl = inject('kiteBaseUrl');

// Create a fetch wrapper that handles relative URLs
global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = input.toString();
  
  // Relative URLs go to the hermetic Kite started by integration-stack.ts
  if (url.startsWith('/')) {
    url = `${kiteBaseUrl}${url}`;
  }
  
  // Use the native fetch (Node 18+)
  return originalFetch(url, init);
};
