import { env, fetchWithTimeout, handle, HttpError, json, requireUser } from './_lib/auth.js';

// 與前端 src/types.ts 的 GENRE_OPTIONS 保持一致
const GENRES = ['角色扮演', '動作冒險', '類魂', '互動式電影', 'Roguelike', '類惡魔城', '恐怖', '音樂/節奏', '策略/模擬', '視覺小說', '休閒益智', '運動競速', '射擊', '格鬥'];

const latestFlashModel = async (key: string): Promise<string | null> => {
  const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } }).catch(() => null);
  if (!res?.ok) return null;
  const names: string[] = ((await res.json()).models || []).map((m: { name: string }) => m.name.replace('models/', ''));
  const version = (n: string) => Number(n.match(/^gemini-([\d.]+)-flash$/)?.[1] ?? 0);
  return names.filter(n => version(n) > 0).sort((a, b) => version(b) - version(a))[0] ?? null;
};

/** 用 Gemini 判斷遊戲類型。直接呼叫 REST API，前端不必再載入整包 Gemini SDK。 */
export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const title = (new URL(request.url).searchParams.get('title') || '').trim().slice(0, 100);
  if (!title) throw new HttpError(400, '請先輸入遊戲名稱');

  const key = env('GEMINI_API_KEY') || env('API_KEY');
  if (!key) throw new HttpError(503, 'AI 自動判斷尚未設定：Vercel 缺少 GEMINI_API_KEY 環境變數');

  const prompt = `Classify the video game "${title}" into exactly one of these Traditional Chinese categories: ${GENRES.join(', ')}.
Return ONLY the category name. If it fits multiple, pick the most dominant one. Do not add punctuation or extra text.`;

  // Google 會陸續停用舊模型（gemini-2.5-flash 已預定停用）。指定的模型找不到時，改用會跟著更新的 flash 別名。
  const models = [...new Set([env('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean) as string[])];
  let lastError = '';
  let discovered = false;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
      20000
    );
    if (res.ok) {
      const data = await res.json();
      const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
      const genre = GENRES.find(g => text === g) || GENRES.find(g => text.includes(g)) || null;
      return json({ genre, raw: text, model });
    }
    const detail = await res.json().catch(() => null);
    lastError = detail?.error?.message || `HTTP ${res.status}`;
    console.warn(`genre: ${model} failed`, res.status, lastError);
    if (/credit|billing|prepay/i.test(lastError)) {
      throw new HttpError(402, 'Gemini 金鑰所屬的專案帳單額度用完了。請到 Google AI Studio 為該專案儲值，或改用沒有開帳單的專案重新建立金鑰（免費額度）');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new HttpError(502, `Gemini 拒絕了這把金鑰，請確認 GEMINI_API_KEY 是否正確（${lastError}）`);
    }
    if (res.status === 429) throw new HttpError(429, 'Gemini 的免費額度暫時用完了，請稍後再試');
    if (res.status !== 404) break;
    // 預設模型都停用了：向 Google 查目前可用的模型，挑版本最新的 Flash 再試一次
    if (i === models.length - 1 && !discovered) {
      discovered = true;
      const latest = await latestFlashModel(key);
      if (latest && !models.includes(latest)) models.push(latest);
    }
  }
  throw new HttpError(502, `AI 服務暫時無法使用（${lastError}）`);
});
