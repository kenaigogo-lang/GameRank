import { vi } from 'vitest';

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 用路由函式取代全域 fetch；沒有路由處理的請求會讓測試失敗，避免真的連網 */
export const mockFetch = (...routes: Route[]) => {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(`${url.hostname}${url.pathname}`);
    for (const route of routes) {
      const res = await route(url, init);
      if (res) return res;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return calls;
};
