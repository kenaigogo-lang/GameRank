import { Game } from '../types';

/**
 * 把上次的清單存在這台裝置上，開站時先顯示，同時再從雲端更新。
 * 只是加速用的副本：雲端仍是唯一的正式資料，讀不到或格式不對就當沒有快取。
 */

const VERSION = 1;
const key = (uid: string) => `gamerank_cache_${uid}`;
// 瀏覽器的 localStorage 通常上限約 5 MB；太大（例如還有很多 base64 封面）就不存
const MAX_CHARS = 4_000_000;

export const loadCachedGames = (uid: string): Game[] | null => {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.v === VERSION && Array.isArray(data.games) ? data.games : null;
  } catch {
    return null;
  }
};

export const saveCachedGames = (uid: string, games: Game[]) => {
  try {
    const raw = JSON.stringify({ v: VERSION, savedAt: Date.now(), games });
    if (raw.length > MAX_CHARS) {
      localStorage.removeItem(key(uid));
      return;
    }
    localStorage.setItem(key(uid), raw);
  } catch {
    // 空間不足或無痕模式：沒有快取也能正常使用
  }
};

/** 登出時清掉，避免共用電腦上留下別人的清單 */
export const clearCachedGames = () => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('gamerank_cache_')).forEach(k => localStorage.removeItem(k));
  } catch {
    // 忽略
  }
};
