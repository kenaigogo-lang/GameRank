import { env, fetchWithTimeout } from './auth.js';

/** IGDB（Twitch）共用工具：取得權杖、中文名稱轉英文、送出查詢。 */

const HAS_CJK = /[\u3400-\u9fff]/;

const wikiEnglish = async (params: string): Promise<string | null> => {
  const url = `https://zh.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&redirects=1&${params}`;
  const res = await fetchWithTimeout(url, { headers: { 'user-agent': 'GameRank/1.0 (cover search)' } }, 5000);
  if (!res.ok) return null;
  const pages = Object.values((await res.json()).query?.pages || {}) as { index?: number; langlinks?: { '*': string }[] }[];
  pages.sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
  const title = pages.find(p => p.langlinks?.length)?.langlinks?.[0]?.['*'];
  // 維基百科用括號區分同名條目，例如「Resident Evil 4 (2023 video game)」，查 IGDB 時要拿掉
  return title ? title.replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
};

// 中文名稱先用維基百科的跨語言連結換成英文，IGDB 對中文支援很弱。
// 條目名稱不完全一樣時（空格、簡繁寫法、副標題），改用維基百科搜尋找最接近的條目。
export const englishTitle = async (query: string): Promise<string | null> =>
  (await wikiEnglish(`titles=${encodeURIComponent(query)}`)) ||
  (await wikiEnglish(`generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(query)}`));

/** 給 IGDB 用的搜尋字：中文會先嘗試換成英文 */
export const igdbSearchTerm = async (query: string) =>
  HAS_CJK.test(query) ? (await englishTitle(query).catch(() => null)) || query : query;

let token: { value: string; expiresAt: number } | null = null;

const getToken = async (clientId: string, secret: string) => {
  if (token && Date.now() < token.expiresAt) return token.value;
  const res = await fetchWithTimeout(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`Twitch auth ${res.status}`);
  const data = await res.json();
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 - 60_000 };
  return token.value;
};

export const igdbConfigured = () => !!env('IGDB_CLIENT_ID') && !!env('IGDB_CLIENT_SECRET');

/** 送出 IGDB 查詢（Apicalypse 語法），沒設定金鑰時回傳 null */
export const igdbQuery = async <T>(endpoint: string, body: string): Promise<T | null> => {
  const clientId = env('IGDB_CLIENT_ID');
  const secret = env('IGDB_CLIENT_SECRET');
  if (!clientId || !secret) return null;
  const res = await fetchWithTimeout(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${await getToken(clientId, secret)}` },
    body,
  });
  if (res.status === 401) token = null;
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  return res.json();
};

export const quote = (text: string) => `"${text.replace(/["\\]/g, '')}"`;
