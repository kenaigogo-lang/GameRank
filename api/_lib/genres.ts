import { igdbQuery, igdbSearchTerm, quote } from './igdb.js';

/** 與前端 src/types.ts 的 GENRE_OPTIONS 保持一致 */
export const GENRES = ['角色扮演', '動作冒險', '類魂', '互動式電影', 'Roguelike', '類惡魔城', '恐怖', '音樂/節奏', '策略/模擬', '視覺小說', '休閒益智', '運動競速', '射擊', '格鬥'] as const;

interface IgdbGame {
  name: string;
  genres?: { name: string }[];
  themes?: { name: string }[];
  keywords?: { name: string }[];
}

/**
 * IGDB 的類型（genres）、主題（themes）、關鍵字（keywords）對應到 GameRank 的 14 個類型。
 * 由最具體的往下排，例如「類魂」比「動作冒險」更能描述艾爾登法環。
 */
const RULES: { genre: (typeof GENRES)[number]; genres?: RegExp; themes?: RegExp; keywords?: RegExp }[] = [
  { genre: '類魂', keywords: /^souls-?like$|soulsborne/i },
  { genre: '類惡魔城', keywords: /^metroidvania$/i },
  { genre: 'Roguelike', keywords: /^rogue-?(like|lite)$/i },
  { genre: '互動式電影', keywords: /^interactive (movie|drama|film)$|^cinematic adventure$/i },
  { genre: '恐怖', themes: /^horror$/i, keywords: /^survival horror$|^psychological horror$/i },
  { genre: '視覺小說', genres: /^visual novel$/i },
  { genre: '音樂/節奏', genres: /^music$/i, keywords: /^rhythm( game)?$/i },
  { genre: '格鬥', genres: /^fighting$/i },
  { genre: '射擊', genres: /^shooter$/i },
  { genre: '運動競速', genres: /^(sport|racing)$/i },
  { genre: '策略/模擬', genres: /strategy|^tactical$|^simulator$|^moba$/i, themes: /^(4x|business)/i },
  { genre: '休閒益智', genres: /^puzzle$|quiz|card & board|^pinball$/i },
  { genre: '角色扮演', genres: /role-playing/i },
  { genre: '動作冒險', genres: /^adventure$|^platform$|hack and slash/i, themes: /^action$/i },
];

const MAX_GENRES = 3;

export const mapIgdbGenres = (game: IgdbGame): string[] => {
  const names = (list?: { name: string }[]) => (list || []).map(x => x.name);
  const g = names(game.genres), t = names(game.themes), k = names(game.keywords);
  const hits = RULES.filter(r =>
    (r.genres && g.some(n => r.genres!.test(n))) ||
    (r.themes && t.some(n => r.themes!.test(n))) ||
    (r.keywords && k.some(n => r.keywords!.test(n)))
  ).map(r => r.genre as string);

  // IGDB 把多數賽車、運動遊戲也標成 Simulator，這時不算「策略/模擬」
  let result = hits.includes('運動競速') && !g.some(n => /strategy|tactical|moba/i.test(n)) ? hits.filter(h => h !== '策略/模擬') : hits;

  // 「動作冒險」太籠統：只有 Action 主題（幾乎每款動作遊戲都有）時，有其他類型就不加；
  // 來自 Adventure／Platform 等類型時，已有兩個以上更具體的類型才不加
  const specific = result.filter(h => h !== '動作冒險');
  const adventureByGenre = g.some(n => /^adventure$|^platform$|hack and slash/i.test(n));
  if (specific.length >= 2 || (specific.length >= 1 && !adventureByGenre)) result = specific;
  return result.slice(0, MAX_GENRES);
};

/** 用 IGDB 查遊戲類型；找不到或沒設定 IGDB 時回傳 null */
export const genresFromIgdb = async (title: string): Promise<{ genres: string[]; matched: string } | null> => {
  const term = await igdbSearchTerm(title);
  const games = await igdbQuery<IgdbGame[]>(
    'games',
    `search ${quote(term)}; fields name, genres.name, themes.name, keywords.name; where version_parent = null; limit 10;`
  );
  if (!games?.length) return null;
  const exact = games.find(x => x.name.toLowerCase() === term.toLowerCase());
  for (const game of exact ? [exact, ...games] : games) {
    const genres = mapIgdbGenres(game);
    if (genres.length) return { genres, matched: game.name };
  }
  return null;
};
