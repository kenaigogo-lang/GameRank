import { handle, HttpError, json, requireUser } from './_lib/auth.js';
import { generateText } from './_lib/gemini.js';
import { GENRES, genresFromIgdb } from './_lib/genres.js';

/**
 * 判斷遊戲類型。
 * 1. 先查 IGDB 的遊戲資料（免費、沒有每日上限、結果固定，可一次給多個類型）。
 * 2. IGDB 查不到才請 Gemini 判斷（有設定 GEMINI_API_KEY 時）。
 */
export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const title = (new URL(request.url).searchParams.get('title') || '').trim().slice(0, 100);
  if (!title) throw new HttpError(400, '請先輸入遊戲名稱');

  const fromIgdb = await genresFromIgdb(title).catch(error => {
    console.warn('genre: IGDB lookup failed', error);
    return null;
  });
  if (fromIgdb) return json({ genres: fromIgdb.genres, source: 'IGDB', matched: fromIgdb.matched });

  const prompt = `Classify the video game "${title}" into exactly one of these Traditional Chinese categories: ${GENRES.join(', ')}.
Return ONLY the category name. If it fits multiple, pick the most dominant one. Do not add punctuation or extra text.`;
  try {
    const { text, model } = await generateText(prompt);
    const genre = GENRES.find(g => text === g) || GENRES.find(g => text.includes(g));
    return json({ genres: genre ? [genre] : [], source: 'AI', model });
  } catch (error) {
    if (error instanceof HttpError && error.status === 503 && /尚未設定/.test(error.message)) {
      throw new HttpError(404, 'IGDB 找不到這款遊戲的類型資料，請手動選擇（或換成英文名稱再試）');
    }
    throw error;
  }
});
