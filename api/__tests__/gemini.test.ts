import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockFetch } from './helpers.js';

const ok = (text: string) => jsonResponse({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text }] } }] });
const error = (status: number, message: string) => jsonResponse({ error: { message } }, status);
const modelOf = (url: URL) => decodeURIComponent(url.pathname.split('/models/')[1]?.split(':')[0] ?? '');
const listModels = (url: URL) =>
  url.pathname.endsWith('/models') ? jsonResponse({ models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash', 'gemini-3.5-pro'].map(n => ({ name: `models/${n}` })) }) : undefined;

describe('generateText（Gemini 換模型）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('預設模型可用時直接使用，並忽略思考內容', async () => {
    mockFetch(url => (modelOf(url) === 'gemini-flash-latest' ? ok('類魂') : undefined));
    const { generateText } = await import('../_lib/gemini.js');
    expect(await generateText('p')).toMatchObject({ text: '類魂', model: 'gemini-flash-latest' });
  });

  it('模型忙碌（503）或免費額度用完（429，訊息含 billing）時換下一個模型', async () => {
    mockFetch(listModels, url => {
      const m = modelOf(url);
      if (m === 'gemini-flash-latest') return error(503, 'This model is currently experiencing high demand.');
      if (m === 'gemini-3.5-flash') return error(429, 'You exceeded your current quota, please check your plan and billing details.');
      if (m === 'gemini-3.5-flash-lite') return ok('恐怖');
      return undefined;
    });
    const { generateText } = await import('../_lib/gemini.js');
    const result = await generateText('p');
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(result.tried).toEqual(['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('預付餘額用完（402）直接停下並說明', async () => {
    mockFetch(() => error(402, 'Your prepayment credits are depleted.'));
    const { generateText } = await import('../_lib/gemini.js');
    await expect(generateText('p')).rejects.toMatchObject({ status: 402, message: expect.stringContaining('帳單額度用完') });
  });

  it('金鑰錯誤直接停下並說明', async () => {
    mockFetch(() => error(400, 'API key not valid.'));
    const { generateText } = await import('../_lib/gemini.js');
    await expect(generateText('p')).rejects.toMatchObject({ message: expect.stringContaining('拒絕了這把金鑰') });
  });

  it('所有模型都忙碌時回報稍後再試', async () => {
    mockFetch(listModels, () => error(503, 'busy'));
    const { generateText } = await import('../_lib/gemini.js');
    await expect(generateText('p')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('太忙') });
  });

  it('沒設金鑰時說明要設定哪個變數', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { generateText } = await import('../_lib/gemini.js');
    await expect(generateText('p')).rejects.toMatchObject({ message: expect.stringContaining('GEMINI_API_KEY') });
  });
});
