import {describe, expect, it} from 'vitest';

import {
  canonicalRequest,
  idempotencyDecision,
  rateLimitDecision,
  safeSignatureEqual,
  signPayload
} from './signing';

describe('reseller API request signing', () => {
  const request = {
    timestamp: '2026-08-15T12:00:00.000Z',
    nonce: 'unique-request-001',
    method: 'post',
    path: '/api/v1/orders?expand=items',
    body: '{"currencyCode":"USD"}'
  };

  it('produces a stable canonical HMAC and rejects tampering', () => {
    const canonical = canonicalRequest(request);
    const signature = signPayload('test-secret', canonical);
    expect(safeSignatureEqual(signature, signPayload('test-secret', canonical))).toBe(true);
    expect(safeSignatureEqual(signature, signPayload('test-secret', `${canonical}x`))).toBe(false);
  });

  it('binds signatures to timestamp, nonce, method, path, and body', () => {
    const original = signPayload('test-secret', canonicalRequest(request));
    for (const patch of [
      {timestamp: '2026-08-15T12:00:01.000Z'},
      {nonce: 'unique-request-002'},
      {method: 'GET'},
      {path: '/api/v1/balance'},
      {body: '{}'}
    ]) {
      expect(signPayload('test-secret', canonicalRequest({...request, ...patch}))).not.toBe(
        original
      );
    }
  });
});

describe('reseller API safety decisions', () => {
  it('enforces fixed-window rate limits without negative remaining counts', () => {
    expect(rateLimitDecision(59, 60)).toEqual({allowed: true, remaining: 1});
    expect(rateLimitDecision(60, 60)).toEqual({allowed: true, remaining: 0});
    expect(rateLimitDecision(61, 60)).toEqual({allowed: false, remaining: 0});
  });

  it('replays only identical completed idempotent requests', () => {
    expect(idempotencyDecision(null, 'a')).toBe('new');
    expect(idempotencyDecision({requestHash: 'a', responseBody: null}, 'a')).toBe('processing');
    expect(idempotencyDecision({requestHash: 'a', responseBody: {id: '1'}}, 'a')).toBe('replay');
    expect(idempotencyDecision({requestHash: 'a', responseBody: {id: '1'}}, 'b')).toBe('conflict');
  });

  it('uses the same primitive for outgoing webhook verification', () => {
    const body = '{"id":"evt_1","type":"order.delivered"}';
    const signed = signPayload('whsec_test', `1786795200.${body}`);
    expect(safeSignatureEqual(signed, signPayload('whsec_test', `1786795200.${body}`))).toBe(true);
    expect(safeSignatureEqual(signed, signPayload('whsec_test', `1786795201.${body}`))).toBe(false);
  });
});
