import { fetchWithTimeout, handle, HttpError, requireUser } from './_lib/auth.js';

const MAX_BYTES = 8 * 1024 * 1024;
// 不轉送到內網或本機位址
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

/**
 * 封面圖片代理：有些圖片網站不允許跨網域讀取，瀏覽器就無法把它縮圖存檔。
 * 前端先直接載入，失敗才走這裡。只轉送圖片、只給已登入的使用者。
 */
export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const raw = new URL(request.url).searchParams.get('url') || '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new HttpError(400, '圖片網址不正確');
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) throw new HttpError(400, '不支援這個圖片網址');

  const upstream = await fetchWithTimeout(target.toString(), { headers: { accept: 'image/*' } }, 10000);
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) throw new HttpError(502, '這個網址抓不到圖片');
  const length = Number(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new HttpError(413, '圖片太大');
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new HttpError(413, '圖片太大');
  return new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
});
