import { env, json } from './_lib/auth.js';

/**
 * 設定檢查：在瀏覽器打開 /api/health，就能看到伺服器端缺了哪些環境變數。
 * 只回報「有沒有設」，不會回傳任何金鑰的值。
 */
const CHECKS: { name: string; needed: string }[] = [
  { name: 'FIREBASE_PROJECT_ID', needed: '所有功能（驗證登入）' },
  { name: 'IGDB_CLIENT_ID', needed: '封面搜尋（IGDB）' },
  { name: 'IGDB_CLIENT_SECRET', needed: '封面搜尋（IGDB）' },
  { name: 'GOOGLE_API_KEY', needed: '封面搜尋（Google）' },
  { name: 'GOOGLE_CX', needed: '封面搜尋（Google）' },
  { name: 'GEMINI_API_KEY', needed: 'AI 自動判斷' },
];

export const GET = async () => {
  const items = CHECKS.map(({ name, needed }) => {
    const value = name === 'GEMINI_API_KEY' ? env(name) || env('API_KEY') : env(name);
    const source = !value ? null : process.env[name] ? name : name === 'GEMINI_API_KEY' && !process.env.VITE_GEMINI_API_KEY && process.env.VITE_API_KEY ? 'VITE_API_KEY（舊名稱）' : `VITE_${name}（舊名稱）`;
    return { name, needed, ok: !!value, from: source };
  });
  return json({ ok: items.every(i => i.ok), items, missing: items.filter(i => !i.ok).map(i => i.name) });
};
