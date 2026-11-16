import { env, fetchWithTimeout, HttpError } from './auth.js';

/**
 * 呼叫 Gemini 產生文字，模型忙碌或停用時自動換下一個。
 * 順序：GEMINI_MODEL（若有）→ gemini-flash-latest → 目前可用的 Flash／Flash-Lite（新到舊）→ gemini-2.5-flash。
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const listFlashModels = async (key: string): Promise<string[]> => {
  const res = await fetchWithTimeout(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } }).catch(() => null);
  if (!res?.ok) return [];
  const names: string[] = ((await res.json()).models || []).map((m: { name: string }) => m.name.replace('models/', ''));
  const parse = (n: string) => n.match(/^gemini-([\d.]+)-flash(-lite)?$/);
  return names
    .filter(n => parse(n))
    // 新版本優先；同版本 Flash 先於 Flash-Lite
    .sort((a, b) => Number(parse(b)![1]) - Number(parse(a)![1]) || Number(!!parse(a)![2]) - Number(!!parse(b)![2]));
};

export interface GeminiResult {
  text: string;
  model: string;
  tried: string[];
}

export const generateText = async (prompt: string): Promise<GeminiResult> => {
  const key = env('GEMINI_API_KEY') || env('API_KEY');
  if (!key) throw new HttpError(503, 'AI 自動判斷尚未設定：Vercel 缺少 GEMINI_API_KEY 環境變數');

  const queue = [env('GEMINI_MODEL'), 'gemini-flash-latest'].filter(Boolean) as string[];
  const tried: string[] = [];
  let discovered = false;
  let lastError = '';
  let lastStatus = 0;
  const started = Date.now();

  while (queue.length > 0) {
    const model = queue.shift()!;
    if (tried.includes(model)) continue;
    tried.push(model);

    const res = await fetchWithTimeout(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }, 15000).catch((error: any) => ({ ok: false, status: 504, json: async () => ({ error: { message: error?.name === 'TimeoutError' ? '逾時' : String(error) } }) }) as unknown as Response);

    if (res.ok) {
      const data = await res.json();
      const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts || [];
      return { text: parts.filter(p => !p.thought).map(p => p.text || '').join('').trim(), model, tried };
    }

    const detail = await res.json().catch(() => null);
    lastError = detail?.error?.message || `HTTP ${res.status}`;
    lastStatus = res.status;
    console.warn(`gemini: ${model} failed`, res.status, lastError);

    // 金鑰或帳單問題換模型也沒用，直接回報
    // 只有「預付餘額用完」才是帳單問題。免費額度用完的 429 訊息也會提到 billing，那種要換模型繼續試
    if (res.status === 402 || /prepay|credits are depleted/i.test(lastError)) {
      throw new HttpError(402, 'Gemini 金鑰所屬的專案帳單額度用完了。請到 Google AI Studio 為該專案儲值，或改用沒有開帳單的專案重新建立金鑰（免費額度）');
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new HttpError(502, `Gemini 拒絕了這把金鑰，請確認 GEMINI_API_KEY 是否正確（${lastError}）`);
    }

    // 停用（404）、忙碌（503／500）、該模型額度用完（429）、逾時：換下一個模型
    if (!discovered && queue.length === 0) {
      discovered = true;
      queue.push(...(await listFlashModels(key)), 'gemini-2.5-flash');
    }
    // Vercel 函式有時間上限，最多花 25 秒
    if (Date.now() - started > 25000) break;
  }

  if (lastStatus === 429) throw new HttpError(429, 'Gemini 的免費額度暫時用完了，請稍後再試');
  if (lastStatus === 503 || lastStatus === 500) throw new HttpError(503, 'Google 的 AI 服務現在太忙，試過幾個模型都沒回應，請過一下再試');
  throw new HttpError(502, `AI 服務暫時無法使用（${lastError}）`);
};
