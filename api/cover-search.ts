import { env, fetchWithTimeout, handle, HttpError, json, requireUser } from './_lib/auth.js';

/**
 * 同時搜尋 Steam、IGDB、Google 圖片，回傳統一格式的封面清單。
 * 以前這些請求都在瀏覽器裡經過公開的 corsproxy.io，而且 IGDB 的 Client Secret 會被打包進前端。
 */

export interface UnifiedGame {
  id: string;
  name: string;
  coverUrl: string;
  source: 'STEAM' | 'IGDB' | 'GOOGLE';
}

const HAS_CJK = /[\u3400-\u9fff]/;

const searchSteam = async (query: string): Promise<UnifiedGame[]> => {
  const url = `https://store.steampowered.com/api/storesearch/?l=tchinese&cc=TW&term=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Steam ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((item: { id: number; name: string }) => ({
    id: `steam-${item.id}`,
    name: item.name,
    coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/library_600x900.jpg`,
    source: 'STEAM' as const,
  }));
};

// 中文名稱先用維基百科的跨語言連結換成英文，IGDB 對中文支援很弱
const englishTitle = async (query: string): Promise<string | null> => {
  const url = `https://zh.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&redirects=1&titles=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { headers: { 'user-agent': 'GameRank/1.0 (cover search)' } }, 5000);
  if (!res.ok) return null;
  const pages = (await res.json()).query?.pages || {};
  const page = Object.values(pages)[0] as { langlinks?: { '*': string }[] } | undefined;
  return page?.langlinks?.[0]?.['*'] ?? null;
};

let igdbToken: { value: string; expiresAt: number } | null = null;

const getIgdbToken = async (clientId: string, secret: string) => {
  if (igdbToken && Date.now() < igdbToken.expiresAt) return igdbToken.value;
  const res = await fetchWithTimeout(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`Twitch auth ${res.status}`);
  const data = await res.json();
  igdbToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 - 60_000 };
  return igdbToken.value;
};

const searchIgdb = async (query: string): Promise<UnifiedGame[]> => {
  const clientId = env('IGDB_CLIENT_ID');
  const secret = env('IGDB_CLIENT_SECRET');
  if (!clientId || !secret) return [];
  const term = HAS_CJK.test(query) ? (await englishTitle(query).catch(() => null)) || query : query;
  const token = await getIgdbToken(clientId, secret);
  const res = await fetchWithTimeout('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
    body: `search "${term.replace(/["\\]/g, '')}"; fields name, cover.url; limit 20; where cover != null;`,
  });
  if (res.status === 401) igdbToken = null;
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  const results: { id: number; name: string; cover?: { url: string } }[] = await res.json();
  return results
    .filter(g => g.cover?.url)
    .map(g => ({
      id: `igdb-${g.id}`,
      name: g.name,
      coverUrl: `https:${g.cover!.url.replace(/^https?:/, '')}`.replace('t_thumb', 't_720p'),
      source: 'IGDB' as const,
    }));
};

const searchGoogle = async (query: string): Promise<UnifiedGame[]> => {
  const key = env('GOOGLE_API_KEY');
  const cx = env('GOOGLE_CX');
  if (!key || !cx) return [];
  const q = `${query} (site:gnn.gamer.com.tw OR site:nintendo.tw)`;
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&searchType=image&num=10`
  );
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((item: { title?: string; link: string }, i: number) => ({
    id: `google-${i}`,
    name: item.title || query,
    coverUrl: item.link,
    source: 'GOOGLE' as const,
  }));
};

export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!query) throw new HttpError(400, '請輸入遊戲名稱');

  const sources = [searchSteam, searchIgdb, searchGoogle];
  const settled = await Promise.allSettled(sources.map(search => search(query)));
  const failed: string[] = [];
  const results = settled.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`cover-search: ${sources[i].name} failed`, r.reason);
    failed.push(['Steam', 'IGDB', 'Google'][i]);
    return [];
  });
  return json({ results, failed });
});
