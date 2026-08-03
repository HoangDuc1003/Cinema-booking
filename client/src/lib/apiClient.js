import axios from 'axios';
import { fetchWithTimeout as requestWithTimeout } from '../services/fetchWithTimeout.js';

/**
 * Normalizes API base URL by trimming whitespace, stripping trailing slashes,
 * stripping trailing /api suffixes, and allowing empty string in dev (Vite proxy).
 */
export const getNormalizedApiBase = (url) => {
  let base = (url || '').trim().replace(/\/+$/, '');
  while (base.endsWith('/api')) {
    base = base.slice(0, -4).replace(/\/+$/, '');
  }
  return base;
};

const rawBaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BASE_URL) ||
  (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_BASE_URL) ||
  '';

export const API_BASE_URL = getNormalizedApiBase(rawBaseUrl);
export const API_BASE = API_BASE_URL;

/**
 * Constructs a full API URL given a path or absolute URL, preventing duplicate /api/api paths.
 */
export const buildApiUrl = (path = '') => {
  const strPath = String(path || '').trim();
  if (!strPath) return API_BASE_URL;

  // Handle absolute URLs
  if (/^https?:\/\//i.test(strPath)) {
    return strPath.replace(/\/api\/api\//g, '/api/');
  }

  let cleanPath = strPath.startsWith('/') ? strPath : `/${strPath}`;

  // Deduplicate /api/api
  while (cleanPath.startsWith('/api/api/')) {
    cleanPath = cleanPath.replace(/^\/api\/api\//, '/api/');
  }

  if (API_BASE_URL) {
    if (API_BASE_URL.endsWith('/api') && cleanPath.startsWith('/api/')) {
      cleanPath = cleanPath.slice(4);
    }
    return `${API_BASE_URL}${cleanPath}`;
  }

  return cleanPath;
};

/**
 * Shared Axios instance configured with normalized API_BASE_URL.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  if (config.url) {
    let url = String(config.url).trim();
    if (url.includes('/api/api/')) {
      config.url = url.replace(/\/api\/api\//g, '/api/');
    }
  }
  return config;
});

/**
 * Shared fetch wrapper with built-in timeout and base URL resolution.
 */
export const fetchApi = async (path, options = {}, timeoutMs = 4500) => {
  const url = buildApiUrl(path);
  return requestWithTimeout(url, options, { timeoutMs });
};

export default apiClient;
