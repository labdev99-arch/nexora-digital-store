import {describe, expect, it} from 'vitest';

import {verifyCsrfRequest} from './csrf';
import {enforceRateLimit} from './rate-limit';
import {sanitizeLimitedHtml, sanitizePlainText} from './sanitize';

describe('launch security helpers', () => {
  it('rejects cross-site cookie mutations and accepts the configured origin', () => {
    const rejected = verifyCsrfRequest(
      new Request('https://nexora.example/api/cart', {
        method: 'POST',
        headers: {origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site'}
      })
    );
    const accepted = verifyCsrfRequest(
      new Request('https://nexora.example/api/cart', {
        method: 'POST',
        headers: {origin: 'https://nexora.example', 'sec-fetch-site': 'same-origin'}
      })
    );
    expect(rejected.allowed).toBe(false);
    expect(accepted.allowed).toBe(true);
  });

  it('allows signed server-to-server surfaces to perform origin-less mutations', () => {
    expect(
      verifyCsrfRequest(new Request('https://nexora.example/api/v1/orders', {method: 'POST'}))
        .allowed
    ).toBe(true);
  });

  it('removes control characters and executable HTML', () => {
    expect(sanitizePlainText(' hello\u0000 ')).toBe('hello');
    expect(sanitizeLimitedHtml('<p onclick="x()">ok</p><script>alert(1)</script>')).toBe(
      '<p>ok</p>alert(1)'
    );
  });

  it('enforces the local fallback rate budget', async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect((await enforceRateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await enforceRateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await enforceRateLimit(key, 2, 60)).allowed).toBe(false);
  });
});
