import { env, fetchWithTimeout, HttpError, json, requireUser } from './_lib/auth.js';
import { generateText } from './_lib/gemini.js';
import { genresFromIgdb, mapIgdbGenres, searchIgdbGames } from './_lib/genres.js';

/**
 * 設定檢查頁。
 * - /api/health：列出伺服器端各項設定有沒有設（金鑰只顯示末 4 碼，方便對照是哪一把）。
 * - /api/health?check=1：用這些設定實際連一次各個外部服務，回報成功或失敗原因。
 *   未登入只做免費的檢查；登入時才會實際做一次 Google 搜尋（每日 100 次中的 1 次）與 Gemini 產生內容。
 */

const tail = (value?: string) => (value ? `…${value.slice(-4)}` : null);

const settings = () => {
  const projectId = env('FIREBASE_PROJECT_ID');
  const gemini = env('GEMINI_API_KEY') || env('API_KEY');
  return {
    FIREBASE_PROJECT_ID: { set: !!projectId, value: projectId ?? null, expected: 'gamerankdb' },
    IGDB_CLIENT_ID: { set: !!env('IGDB_CLIENT_ID'), value: tail(env('IGDB_CLIENT_ID')) },
    IGDB_CLIENT_SECRET: { set: !!env('IGDB_CLIENT_SECRET'), value: tail(env('IGDB_CLIENT_SECRET')) },
    GOOGLE_API_KEY: { set: !!env('GOOGLE_API_KEY'), value: tail(env('GOOGLE_API_KEY')) },
    GOOGLE_CX: { set: !!env('GOOGLE_CX'), value: env('GOOGLE_CX') ?? null },
    GEMINI_API_KEY: { set: !!gemini, value: tail(gemini) },
    GEMINI_MODEL: { set: !!env('GEMINI_MODEL'), value: env('GEMINI_MODEL') ?? '（未設定，使用 gemini-flash-latest）' },
  };
};

type Check = { ok: boolean; detail: string };

const errorText = async (res: Response) => {
  const body = await res.text().catch(() => '');
  try {
    const data = JSON.parse(body);
    return `HTTP ${res.status}：${data?.error?.message || data?.message || body.slice(0, 200)}`;
  } catch {
    return `HTTP ${res.status}：${body.slice(0, 200)}`;
  }
};

const run = async (fn: () => Promise<Check>): Promise<Check> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof HttpError) return { ok: false, detail: error.message };
    return { ok: false, detail: `連線失敗：${error?.name === 'TimeoutError' ? '逾時' : error?.message || error}` };
  }
};

const checks = async (signedIn: boolean): Promise<Record<string, Check>> => {
  const projectId = env('FIREBASE_PROJECT_ID');
  const igdbId = env('IGDB_CLIENT_ID');
  const igdbSecret = env('IGDB_CLIENT_SECRET');
  const gemini = env('GEMINI_API_KEY') || env('API_KEY');
  const googleKey = env('GOOGLE_API_KEY');
  const cx = env('GOOGLE_CX');

  const [login, steam, igdb, geminiCheck, google] = await Promise.all([
    run(async () => {
      if (!projectId) return { ok: false, detail: '沒有設定 FIREBASE_PROJECT_ID，所有功能都會回「請先登入」' };
      const res = await fetchWithTimeout('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!res.ok) return { ok: false, detail: `抓不到 Google 的登入驗證金鑰（${res.status}）` };
      return projectId === 'gamerankdb'
        ? { ok: true, detail: '專案 ID 正確，可以驗證登入' }
        : { ok: false, detail: `FIREBASE_PROJECT_ID 是「${projectId}」，應該是「gamerankdb」，否則每個請求都會被當成未登入` };
    }),
    run(async () => {
      const res = await fetchWithTimeout('https://store.steampowered.com/api/storesearch/?l=tchinese&cc=TW&term=elden');
      return res.ok ? { ok: true, detail: `可連線，找到 ${(await res.json()).total ?? 0} 筆` } : { ok: false, detail: await errorText(res) };
    }),
    run(async () => {
      if (!igdbId || !igdbSecret) return { ok: false, detail: '缺少 IGDB_CLIENT_ID 或 IGDB_CLIENT_SECRET' };
      const tok = await fetchWithTimeout(`https://id.twitch.tv/oauth2/token?client_id=${igdbId}&client_secret=${igdbSecret}&grant_type=client_credentials`, { method: 'POST' });
      if (!tok.ok) return { ok: false, detail: `Twitch 拒絕這組 Client ID／Secret（${await errorText(tok)}）` };
      const { access_token } = await tok.json();
      const res = await fetchWithTimeout('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': igdbId, Authorization: `Bearer ${access_token}` },
        body: 'search "elden ring"; fields name; limit 1;',
      });
      return res.ok ? { ok: true, detail: `可連線，第一筆：${(await res.json())[0]?.name ?? '（無）'}` } : { ok: false, detail: await errorText(res) };
    }),
    run(async () => {
      if (!gemini) return { ok: false, detail: '缺少 GEMINI_API_KEY' };
      if (!signedIn) {
        // 未登入只做免費的檢查（列出模型），不消耗產生內容的額度
        const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': gemini } });
        return res.ok ? { ok: true, detail: '金鑰有效（未登入只檢查金鑰；登入後才會實際呼叫一次）' } : { ok: false, detail: `Gemini 拒絕這把金鑰（${await errorText(res)}）` };
      }
      // 和 AI 自動判斷走同一套流程（含忙碌時換模型），只要求回一個字
      const { model, tried } = await generateText('Reply with the single word OK.');
      return { ok: true, detail: `實際呼叫成功，使用 ${model}${tried.length > 1 ? `（先試過 ${tried.slice(0, -1).join('、')}）` : ''}` };
    }),
    run(async () => {
      if (!googleKey || !cx) return { ok: false, detail: '沒有設定 GOOGLE_API_KEY／GOOGLE_CX，封面搜尋會略過 Google（不影響 Steam、IGDB）' };
      // 每次搜尋都會用掉每天 100 次的免費額度，只給登入的人測
      if (!signedIn) return { ok: true, detail: '已設定（實際搜尋會用掉額度，登入後才會測試）' };
      const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${cx}&q=elden%20ring&searchType=image&num=1`);
      return res.ok ? { ok: true, detail: '可連線' } : { ok: false, detail: await errorText(res) };
    }),
  ]);
  const genreCheck = await run(async () => {
    if (!igdbId || !igdbSecret) return { ok: false, detail: '缺少 IGDB 設定' };
    const samples = ['Elden Ring', 'Hollow Knight', 'Hades', '底特律：變人', 'Street Fighter 6'];
    const out = await Promise.all(samples.map(async t => {
      const r = await genresFromIgdb(t);
      return `${t} → ${r ? `${r.genres.join('、')}（IGDB：${r.matched}）` : '查不到'}`;
    }));
    return { ok: true, detail: out.join('；') };
  });
  return { '類型判斷（IGDB）': genreCheck, '登入驗證': login, 'Steam 封面搜尋': steam, 'IGDB 封面搜尋': igdb, '類型判斷備援（Gemini，可不設定）': geminiCheck, 'Google 封面搜尋': google };
};

export const GET = async (request: Request) => {
  const params = new URL(request.url).searchParams;
  // /api/health?igdb=遊戲名稱：看 IGDB 原始的類型資料與對應結果（調整對應規則用）
  const igdbTitle = params.get('igdb');
  if (igdbTitle) {
    const { term, games } = await searchIgdbGames(igdbTitle.slice(0, 100));
    return json({
      term,
      candidates: games.slice(0, 5).map(g => ({
        name: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
        ratings: g.total_rating_count ?? 0,
        genres: (g.genres || []).map(x => x.name),
        themes: (g.themes || []).map(x => x.name),
        keywords: (g.keywords || []).map(x => x.name).slice(0, 60),
        mapped: mapIgdbGenres(g),
      })),
    });
  }
  const deep = params.get('check') === '1';
  const body: Record<string, unknown> = { settings: settings() };
  if (deep) {
    // 會用到付費／有限額度的測試（Google 搜尋、Gemini 產生內容）只給登入的人跑，免得網址被拿去消耗額度
    const signedIn = await requireUser(request).then(() => true, () => false);
    body.checks = await checks(signedIn);
    if (!signedIn) body.note = '未登入：只做不消耗額度的檢查。帶登入憑證呼叫才會實際測試 Google 搜尋與 Gemini。';
  }
  else body.hint = '加上 ?check=1 會實際連線測試每個服務';
  return json(body);
};
