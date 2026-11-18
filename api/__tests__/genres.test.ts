import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapIgdbGenres } from '../_lib/genres.js';

const real: Record<string, { genres: string[]; themes: string[]; keywords: string[] }> = JSON.parse(
  readFileSync(new URL('./fixtures/igdb-games.json', import.meta.url), 'utf8')
);
const toGame = (raw: { genres?: string[]; themes?: string[]; keywords?: string[] }) => ({
  name: 'x',
  genres: raw.genres?.map(name => ({ name })),
  themes: raw.themes?.map(name => ({ name })),
  keywords: raw.keywords?.map(name => ({ name })),
});

describe('mapIgdbGenres（IGDB 真實資料）', () => {
  it.each([
    ['Hollow Knight', ['類惡魔城', '動作冒險']],
    ['Hades', ['Roguelike', '角色扮演']],
    ['Detroit: Become Human', ['互動式電影']],
    ['The Legend of Zelda: Tears of the Kingdom', ['動作冒險']],
    ['Resident Evil 4', ['恐怖', '射擊']],
    ["Baldur's Gate 3", ['策略/模擬', '角色扮演']],
    ['Ghost of Tsushima', ['角色扮演', '動作冒險']],
  ])('%s', (name, expected) => {
    expect(mapIgdbGenres(toGame(real[name]))).toEqual(expected);
  });
});

describe('mapIgdbGenres（規則）', () => {
  it('類魂來自關鍵字，比動作冒險優先', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Role-playing (RPG)', 'Adventure'], themes: ['Action'], keywords: ['soulslike'] }))).toEqual(['類魂', '角色扮演']);
  });
  it('只有 Action 主題時，不替格鬥遊戲加上動作冒險', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Fighting'], themes: ['Action'] }))).toEqual(['格鬥']);
  });
  it('賽車遊戲標了 Simulator 也不算策略/模擬', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Racing', 'Simulator', 'Sport'] }))).toEqual(['運動競速']);
  });
  it('真正的模擬遊戲仍算策略/模擬', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Simulator', 'Strategy'] }))).toEqual(['策略/模擬']);
  });
  it('解謎是主要玩法時才算休閒益智', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Puzzle', 'Arcade'] }))).toEqual(['休閒益智']);
  });
  it('最多三個類型', () => {
    const many = toGame({ genres: ['Shooter', 'Fighting', 'Racing', 'Music'], themes: ['Horror'] });
    expect(mapIgdbGenres(many)).toHaveLength(3);
  });
  it('沒有可對應的資料時回傳空陣列', () => {
    expect(mapIgdbGenres(toGame({ genres: ['Indie'] }))).toEqual([]);
  });
});
