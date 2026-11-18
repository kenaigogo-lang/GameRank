import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from './helpers.js';

vi.mock('../_lib/auth.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../_lib/auth.js')>()),
  requireUser: async () => 'user-1',
}));

const call = async (target: string) => {
  const { GET } = await import('../image.js');
  return GET(new Request(`https://x/api/image?url=${encodeURIComponent(target)}`));
};

describe('/api/image（圖片轉送）', () => {
  beforeEach(() => {
    mockFetch(url => {
      if (url.hostname === 'img.example.com') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
      if (url.hostname === 'page.example.com') return new Response('<html>', { headers: { 'content-type': 'text/html' } });
      return undefined;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('轉送圖片', async () => {
    const res = await call('https://img.example.com/a.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it.each([
    ['不是圖片', 'https://page.example.com/', 502],
    ['內網位址', 'http://169.254.169.254/latest', 400],
    ['本機', 'http://localhost:3000/x', 400],
    ['file: 網址', 'file:///etc/passwd', 400],
  ])('拒絕%s', async (_label, target, status) => {
    expect((await call(target)).status).toBe(status);
  });
});
