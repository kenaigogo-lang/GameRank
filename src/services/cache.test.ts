import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedGames, loadCachedGames, saveCachedGames } from './cache';
import { Game, Platform } from '../types';

const game = (id: string, extra: Partial<Game> = {}): Game => ({
  id, title: id, platform: Platform.PS, score: 8, comment: '', ratingDate: '2026-01-01', addedAt: 1, ...extra,
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    clear: () => data.clear(),
  };
};

describe('裝置上的清單快取', () => {
  beforeEach(() => {
    const storage = memoryStorage();
    // Object.keys(localStorage) 要能列出鍵
    vi.stubGlobal('localStorage', new Proxy(storage, { ownKeys: () => [...Array(storage.length)].map((_, i) => storage.key(i)!), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }));
  });

  it('存了之後讀得回來，且依使用者分開', () => {
    saveCachedGames('a', [game('g1')]);
    expect(loadCachedGames('a')?.map(g => g.id)).toEqual(['g1']);
    expect(loadCachedGames('b')).toBeNull();
  });

  it('太大的清單不存（例如還有大量 base64 封面）', () => {
    saveCachedGames('a', [game('g1', { imageUrl: 'data:image/jpeg;base64,' + 'A'.repeat(4_100_000) })]);
    expect(loadCachedGames('a')).toBeNull();
  });

  it('內容損毀時當作沒有快取', () => {
    localStorage.setItem('gamerank_cache_a', '{broken');
    expect(loadCachedGames('a')).toBeNull();
  });

  it('登出時清掉所有快取', () => {
    saveCachedGames('a', [game('g1')]);
    saveCachedGames('b', [game('g2')]);
    localStorage.setItem('gamerank_theme', 'nes');
    clearCachedGames();
    expect(loadCachedGames('a')).toBeNull();
    expect(loadCachedGames('b')).toBeNull();
    expect(localStorage.getItem('gamerank_theme')).toBe('nes');
  });
});
