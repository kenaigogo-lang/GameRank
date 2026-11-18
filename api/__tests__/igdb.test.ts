import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockFetch } from './helpers.js';

const wikiPages = (titles: string[]) =>
  jsonResponse({ query: { pages: Object.fromEntries(titles.map((t, i) => [String(i + 1), { index: i + 1, langlinks: [{ '*': t }] }])) } });

describe('englishTitle（中文名稱轉英文）', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('有完全相同的條目時直接使用，並拿掉括號說明', async () => {
    mockFetch(url => (url.searchParams.get('titles') ? wikiPages(['Resident Evil 4 (2023 video game)']) : undefined));
    const { englishTitle } = await import('../_lib/igdb.js');
    expect(await englishTitle('惡靈古堡4 重製版')).toBe('Resident Evil 4');
  });

  it('沒有完全相同的條目時改用搜尋，並要求代數相同', async () => {
    mockFetch(url => {
      if (url.searchParams.get('titles')) return jsonResponse({ query: { pages: { '-1': { missing: '' } } } });
      if (url.searchParams.get('generator') === 'search') return wikiPages(['Forza Horizon 6', 'Forza Horizon 5']);
      return undefined;
    });
    const { englishTitle } = await import('../_lib/igdb.js');
    expect(await englishTitle('極限競速：地平線 5')).toBe('Forza Horizon 5');
  });

  it('搜尋結果的代數都對不上時回傳 null', async () => {
    mockFetch(url => (url.searchParams.get('titles') ? jsonResponse({ query: { pages: {} } }) : wikiPages(['Forza Horizon 6'])));
    const { englishTitle } = await import('../_lib/igdb.js');
    expect(await englishTitle('地平線 9')).toBeNull();
  });
});
