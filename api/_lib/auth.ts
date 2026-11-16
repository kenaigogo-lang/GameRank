import { createRemoteJWKSet, jwtVerify } from 'jose';

/** 讀伺服器端環境變數；相容舊的 VITE_ 前綴名稱，Vercel 上不必先改名也能運作 */
export const env = (name: string): string | undefined => process.env[name] || process.env[`VITE_${name}`] || undefined;

// Firebase 登入憑證（ID token）由 Google 簽發，用公開金鑰驗證即可，不需要服務帳戶
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 只讓已登入 GameRank 的使用者呼叫，避免金鑰額度被別人拿去用 */
export const requireUser = async (request: Request): Promise<string> => {
  const projectId = env('FIREBASE_PROJECT_ID');
  if (!projectId) throw new HttpError(500, '伺服器缺少 FIREBASE_PROJECT_ID 設定');
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, '請先登入');
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) throw new Error('missing sub');
    return payload.sub;
  } catch {
    throw new HttpError(401, '登入已過期，請重新登入');
  }
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

/** 統一錯誤格式：{ error: 訊息 } */
export const handle = (fn: (request: Request) => Promise<Response>) => async (request: Request) => {
  try {
    return await fn(request);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: '伺服器發生錯誤' }, 500);
  }
};

/** 有逾時的 fetch，外部服務卡住時不會拖垮整個請求 */
export const fetchWithTimeout = (url: string, init: RequestInit = {}, ms = 8000) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
