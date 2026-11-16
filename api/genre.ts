import { env, fetchWithTimeout, handle, HttpError, json, requireUser } from './_lib/auth.js';

// 與前端 src/types.ts 的 GENRE_OPTIONS 保持一致
const GENRES = ['角色扮演', '動作冒險', '類魂', '互動式電影', 'Roguelike', '類惡魔城', '恐怖', '音樂/節奏', '策略/模擬', '視覺小說', '休閒益智', '運動競速', '射擊', '格鬥'];

/** 用 Gemini 判斷遊戲類型。直接呼叫 REST API，前端不必再載入整包 Gemini SDK。 */
export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const title = (new URL(request.url).searchParams.get('title') || '').trim().slice(0, 100);
  if (!title) throw new HttpError(400, '請先輸入遊戲名稱');

  const key = env('GEMINI_API_KEY') || env('API_KEY');
  if (!key) throw new HttpError(503, 'AI 自動判斷尚未設定（缺少 GEMINI_API_KEY）');
  const model = env('GEMINI_MODEL') || 'gemini-2.5-flash';

  const prompt = `Classify the video game "${title}" into exactly one of these Traditional Chinese categories: ${GENRES.join(', ')}.
Return ONLY the category name. If it fits multiple, pick the most dominant one. Do not add punctuation or extra text.`;

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
    15000
  );
  if (!res.ok) {
    console.warn('genre: Gemini error', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, `AI 服務暫時無法使用（${res.status}）`);
  }
  const data = await res.json();
  const text: string = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
  const genre = GENRES.find(g => text === g) || GENRES.find(g => text.includes(g)) || null;
  return json({ genre, raw: text });
});
