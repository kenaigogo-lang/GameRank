import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { jsonResponse, mockFetch } from './helpers.js';

const PROJECT = 'gamerankdb';
const keys = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

const token = (opts: { aud?: string; expired?: boolean } = {}) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://securetoken.google.com/${opts.aud ?? PROJECT}`)
    .setAudience(opts.aud ?? PROJECT)
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 60 : '1h')
    .sign(keys.privateKey);

const request = (auth?: string) => new Request('https://x/api/cover-search?q=x', { headers: auth ? { authorization: `Bearer ${auth}` } : {} });

describe('requireUser（Firebase 登入憑證）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('FIREBASE_PROJECT_ID', PROJECT);
    mockFetch(url => (url.pathname.includes('securetoken') ? jsonResponse({ keys: [jwk] }) : undefined));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('接受本專案的有效憑證', async () => {
    const { requireUser } = await import('../_lib/auth.js');
    expect(await requireUser(request(await token()))).toBe('user-1');
  });

  it.each([
    ['沒有憑證', async () => undefined, '請先登入'],
    ['別的專案的憑證', () => token({ aud: 'other-project' }), '登入已過期'],
    ['過期的憑證', () => token({ expired: true }), '登入已過期'],
  ])('拒絕%s', async (_label, make, message) => {
    const { requireUser } = await import('../_lib/auth.js');
    await expect(requireUser(request(await make()))).rejects.toMatchObject({ status: 401, message: expect.stringContaining(message) });
  });

  it('相容舊的 VITE_ 變數名稱', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT);
    const { requireUser } = await import('../_lib/auth.js');
    expect(await requireUser(request(await token()))).toBe('user-1');
  });
});
