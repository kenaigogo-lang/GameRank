import { auth } from './firebase';

/** 呼叫 Vercel 上的伺服器端函式（api/）；金鑰都留在伺服器，這裡只帶登入憑證 */
const callApi = async (path: string, params: Record<string, string>): Promise<Response> => {
  const user = auth.currentUser;
  if (!user) throw new Error('請先登入才能使用這個功能。');
  const token = await user.getIdToken();
  const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    const data = type.includes('json') ? await res.json().catch(() => null) : null;
    throw new Error(data?.error || `服務暫時無法使用（${res.status}）`);
  }
  // 用 vite dev 開發時沒有 /api，會拿到網頁本身
  if (type.includes('text/html')) throw new Error('找不到伺服器端功能。本機開發請改用 `vercel dev`。');
  return res;
};

export interface UnifiedGame {
  id: string;
  name: string;
  coverUrl: string;
  source: 'STEAM' | 'IGDB' | 'GOOGLE';
}

export const searchCovers = async (query: string): Promise<{ results: UnifiedGame[]; failed: string[] }> =>
  (await callApi('cover-search', { q: query })).json();

export const fetchGenre = async (title: string): Promise<string | null> =>
  (await (await callApi('genre', { title })).json()).genre ?? null;

/** 透過伺服器轉送圖片（給不允許跨網域讀取的圖片網站用） */
export const fetchImageViaProxy = async (url: string): Promise<Blob> =>
  (await callApi('image', { url })).blob();
