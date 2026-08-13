/**
 * API Client for communicating with the backend Express service
 * 
 * This utility provides functions to interact with the backend API
 * for feed fetching, source management, and other operations.
 */

// Use relative URL in production (Vercel), localhost in development
// In production, always use relative URLs (same domain) unless VITE_API_URL is explicitly set
const API_BASE_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Base fetch function with error handling
 */
async function apiFetch(endpoint: string, options: FetchOptions = {}): Promise<Response> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_BASE_URL}${endpoint}`;
  
  // Add query parameters if provided
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
  }

  return response;
}

/**
 * Health check endpoint
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await apiFetch('/health');
  return response.json();
}

/**
 * Feed fetching endpoints
 */
export const feedsApi = {
  /**
   * Fetch news from all enabled sources
   */
  async fetchAll(sources: Array<{ id: string; name: string; type: string; url: string; enabled: boolean; createdAt: string }>) {
    const response = await apiFetch('/api/feeds/fetch', {
      method: 'POST',
      body: JSON.stringify({ sources }),
    });
    return response.json();
  },

  /**
   * Fetch news from a specific source
   */
  async fetchSource(sourceId: string, source: { id: string; name: string; type: string; url: string; enabled: boolean; createdAt: string }) {
    const response = await apiFetch(`/api/feeds/fetch/${sourceId}`, {
      method: 'POST',
      body: JSON.stringify({ source }),
    });
    return response.json();
  },

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const response = await apiFetch('/api/feeds/cache/stats');
    return response.json();
  },

  /**
   * Clear cache for a specific source
   */
  async clearCache(sourceId: string) {
    const response = await apiFetch(`/api/feeds/cache/${sourceId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  /**
   * Clear all cache
   */
  async clearAllCache() {
    const response = await apiFetch('/api/feeds/cache', {
      method: 'DELETE',
    });
    return response.json();
  },
};

/**
 * Source management endpoints
 */
export const sourcesApi = {
  /**
   * Test a news source configuration
   */
  async test(source: { id: string; name: string; type: string; url: string; enabled: boolean; createdAt: string }) {
    const response = await apiFetch('/api/sources/test', {
      method: 'POST',
      body: JSON.stringify({ source }),
    });
    return response.json();
  },
};

/**
 * Scheduler endpoints
 */
export const schedulerApi = {
  /**
   * Start scheduled feed fetching
   */
  async start(sources: Array<{ id: string; name: string; type: string; url: string; enabled: boolean; createdAt: string }>, schedule?: string) {
    const response = await apiFetch('/api/scheduler/start', {
      method: 'POST',
      body: JSON.stringify({ sources, schedule }),
    });
    return response.json();
  },

  /**
   * Stop scheduled feed fetching
   */
  async stop() {
    const response = await apiFetch('/api/scheduler/stop', {
      method: 'POST',
    });
    return response.json();
  },

  /**
   * Get scheduler status
   */
  async getStatus() {
    const response = await apiFetch('/api/scheduler/status');
    return response.json();
  },
};

/**
 * Generic API client for custom endpoints
 */
export const apiClient = {
  /**
   * GET request
   */
  async get(endpoint: string, params?: Record<string, string>) {
    const response = await apiFetch(endpoint, { method: 'GET', params });
    return response.json();
  },

  /**
   * POST request
   */
  async post(endpoint: string, data?: any) {
    const response = await apiFetch(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
    return response.json();
  },

  /**
   * PATCH request
   */
  async patch(endpoint: string, data?: any) {
    const response = await apiFetch(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
    return response.json();
  },

  /**
   * DELETE request
   */
  async delete(endpoint: string) {
    const response = await apiFetch(endpoint, {
      method: 'DELETE',
    });
    return response.json();
  },
};

