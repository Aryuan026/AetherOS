/**
 * MiniMax API endpoint resolution + native HTTP for Capacitor.
 *
 * Web/dev mode: prefers `/api/minimax/*` when a proxy exists.
 * Static web/file previews: falls back to MiniMax upstream directly.
 * Capacitor native: uses CapacitorHttp to bypass browser CORS.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { safeResponseJson } from './safeApi';

type MiniMaxResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const PROXY_MAP: Record<string, string> = {
  '/api/minimax/t2a': 'https://api.minimaxi.com/v1/t2a_v2',
  '/api/minimax/get-voice': 'https://api.minimaxi.com/v1/get_voice',
};

const wrapWebResponse = (response: Response): MiniMaxResponseLike => ({
  ok: response.ok,
  status: response.status,
  json: async () => safeResponseJson(response.clone()),
});

/**
 * Return the actual URL to fetch for a given proxy path.
 */
export function resolveMinimaxUrl(proxyPath: string): string {
  if (PROXY_MAP[proxyPath] && isNative()) {
    return PROXY_MAP[proxyPath];
  }
  return proxyPath;
}

const normalizeHeaders = (headers: Record<string, string> = {}): Record<string, string> => {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    normalized[k.toLowerCase()] = v;
  });
  return normalized;
};

const buildUpstreamWebInit = (
  init: { method?: string; headers?: Record<string, string>; body?: string },
): { method?: string; headers?: Record<string, string>; body?: string } => {
  const headers = normalizeHeaders(init.headers || {});
  const groupId = (headers['x-minimax-group-id'] || '').trim();

  // MiniMax upstream CORS does not accept these custom headers.
  delete headers['x-minimax-api-key'];
  delete headers['x-minimax-group-id'];

  if (!groupId || !init.body) {
    return { ...init, headers };
  }

  try {
    const body = JSON.parse(init.body);
    if (body && typeof body === 'object' && !body.group_id) {
      body.group_id = groupId;
      return { ...init, headers, body: JSON.stringify(body) };
    }
  } catch {
    // Keep the original body when it is not JSON.
  }

  return { ...init, headers };
};

const shouldBypassWebProxy = (proxyPath: string): boolean => {
  if (!PROXY_MAP[proxyPath]) return false;
  if (typeof window === 'undefined') return false;

  const protocol = String(window.location.protocol || '').toLowerCase();
  if (protocol === 'file:') return true;

  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'github.io' || host.endsWith('.github.io');
};

const shouldRetryAgainstUpstream = (proxyPath: string, response: Response): boolean => {
  if (!PROXY_MAP[proxyPath]) return false;
  if (response.status === 404 || response.status === 405) return true;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
};

const fetchUpstreamWeb = async (
  proxyPath: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<MiniMaxResponseLike> => {
  return wrapWebResponse(await fetch(PROXY_MAP[proxyPath], buildUpstreamWebInit(init)));
};

/**
 * A fetch-like wrapper that uses CapacitorHttp on native platforms
 * and safe JSON parsing on web.
 */
export async function minimaxFetch(
  proxyPath: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<MiniMaxResponseLike> {
  const url = resolveMinimaxUrl(proxyPath);

  if (!isNative()) {
    if (shouldBypassWebProxy(proxyPath)) {
      return fetchUpstreamWeb(proxyPath, init);
    }

    try {
      const res = await fetch(url, init);
      // Static preview servers can rewrite missing /api routes to index.html.
      if (shouldRetryAgainstUpstream(proxyPath, res)) {
        return fetchUpstreamWeb(proxyPath, init);
      }
      return wrapWebResponse(res);
    } catch (error) {
      if (PROXY_MAP[proxyPath]) {
        return fetchUpstreamWeb(proxyPath, init);
      }
      throw error;
    }
  }

  const response = await CapacitorHttp.request({
    url,
    method: init.method || 'POST',
    headers: init.headers || {},
    data: init.body ? JSON.parse(init.body) : undefined,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.data,
  };
}
