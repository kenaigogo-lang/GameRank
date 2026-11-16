import { handle, HttpError, json, requireUser } from './_lib/auth.js';
import { generateText } from './_lib/gemini.js';

// 與前端 src/types.ts 的 GENRE_OPTIONS 保持一致
const GENRES = ['角色扮演', '動作冒險', '類魂', '互動式電影', 'Roguelike', '類惡魔城', '恐怖', '音樂/節奏', '策略/模擬', '視覺小說', '休閒益智', '運動競速', '射擊', '格鬥'];

/** 用 Gemini 判斷遊戲類型（模型選擇與錯誤處理在 _lib/gemini.ts）。 */
export const GET = handle(async (request: Request) => {
  await requireUser(request);
  const title = (new URL(request.url).searchParams.get('title') || '').trim().slice(0, 100);
  if (!title) throw new HttpError(400, '請先輸入遊戲名稱');

  const prompt = `Classify the video game "${title}" into exactly one of these Traditional Chinese categories: ${GENRES.join(', ')}.
Return ONLY the category name. If it fits multiple, pick the most dominant one. Do not add punctuation or extra text.`;

  const { text, model } = await generateText(prompt);
  const genre = GENRES.find(g => text === g) || GENRES.find(g => text.includes(g)) || null;
  return json({ genre, raw: text, model });
});
