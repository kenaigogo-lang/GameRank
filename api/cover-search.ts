import { env, fetchWithTimeout, handle, HttpError, json, requireUser } from './_lib/auth.js';
import { igdbConfigured, igdbQuery, igdbSearchTerm, quote } from './_lib/igdb.js';

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

const searchIgdb = async (query: string): Promise<UnifiedGame[]> => {
  if (!igdbConfigured()) return [];
  const term = await igdbSearchTerm(query);
  const results = await igdbQuery<{ id: number; name: string; cover?: { url: string } }[]>(
    'games',
    `search ${quote(term)}; fields name, cover.url; limit 20; where cover != null;`
  );
  return (results || [])
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
