import 'server-only';

import {createHash} from 'node:crypto';
import {aiRest} from './rest';
import {getAiProvider, type AiMessage, type AiTextResult, type AiVisionResult} from './provider';

const timeoutMs = Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS ?? 12000), 1000), 45000);

function costMinor(inputTokens = 0, outputTokens = 0) {
  const inputRate = Math.max(0, Number(process.env.AI_INPUT_COST_PER_MILLION_MINOR ?? 0));
  const outputRate = Math.max(0, Number(process.env.AI_OUTPUT_COST_PER_MILLION_MINOR ?? 0));
  return Math.ceil((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000);
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function usage(input: {
  profileId?: string | null;
  feature: string;
  provider: string;
  model: string;
  requestHash: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  cacheHit?: boolean;
  status: 'success' | 'fallback' | 'timeout' | 'error' | 'rate_limited' | 'disabled';
  errorCode?: string;
}) {
  try {
    await aiRest('ai_usage_logs', {
      method: 'POST',
      body: JSON.stringify({
        profile_id: input.profileId ?? null,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        request_hash: input.requestHash,
        input_tokens: input.inputTokens ?? 0,
        output_tokens: input.outputTokens ?? 0,
        cost_minor: costMinor(input.inputTokens, input.outputTokens),
        latency_ms: input.latencyMs,
        cache_hit: input.cacheHit ?? false,
        status: input.status,
        error_code: input.errorCode ?? null
      })
    });
  } catch {
    // Telemetry must never break the storefront.
  }
}

async function withinLimit(profileId: string | null | undefined, feature: string) {
  if (!profileId) return true;
  const max = Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 30));
  const since = encodeURIComponent(new Date(Date.now() - 3600000).toISOString());
  const rows = await aiRest<Array<{id: string}>>(
    `ai_usage_logs?select=id&profile_id=eq.${profileId}&feature=eq.${encodeURIComponent(feature)}&created_at=gte.${since}&limit=${max}`
  );
  return rows.length < max;
}

export async function runAiText(input: {
  profileId?: string | null;
  feature: string;
  messages: AiMessage[];
  cacheSeconds?: number;
}): Promise<AiTextResult | null> {
  const provider = getAiProvider();
  const requestHash = hash({feature: input.feature, messages: input.messages});
  const started = Date.now();
  if (!provider.enabled) {
    await usage({
      profileId: input.profileId,
      feature: input.feature,
      provider: provider.name,
      model: 'none',
      requestHash,
      latencyMs: 0,
      status: 'disabled'
    });
    return null;
  }
  if (!(await withinLimit(input.profileId, input.feature))) {
    await usage({
      profileId: input.profileId,
      feature: input.feature,
      provider: provider.name,
      model: 'rate-limit',
      requestHash,
      latencyMs: 0,
      status: 'rate_limited'
    });
    return null;
  }
  if (input.cacheSeconds) {
    const cached = await aiRest<
      Array<{
        response: {
          text?: string;
          model?: string;
          usage?: {inputTokens?: number; outputTokens?: number};
        };
      }>
    >(
      `ai_cache?select=response&cache_key=eq.${requestHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
    );
    const hit = cached[0]?.response;
    if (hit?.text) {
      await usage({
        profileId: input.profileId,
        feature: input.feature,
        provider: provider.name,
        model: hit.model ?? 'cached',
        requestHash,
        latencyMs: Date.now() - started,
        status: 'success',
        cacheHit: true
      });
      return {
        text: hit.text,
        model: hit.model ?? 'cached',
        usage: {
          inputTokens: hit.usage?.inputTokens ?? 0,
          outputTokens: hit.usage?.outputTokens ?? 0
        }
      };
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await provider.chat(input.messages, controller.signal);
    if (input.cacheSeconds)
      await aiRest('ai_cache?on_conflict=cache_key', {
        method: 'POST',
        headers: {prefer: 'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify({
          cache_key: requestHash,
          feature: input.feature,
          provider: provider.name,
          model: result.model,
          response: result,
          expires_at: new Date(Date.now() + input.cacheSeconds * 1000).toISOString()
        })
      });
    await usage({
      profileId: input.profileId,
      feature: input.feature,
      provider: provider.name,
      model: result.model,
      requestHash,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs: Date.now() - started,
      status: 'success'
    });
    return result;
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'AbortError';
    await usage({
      profileId: input.profileId,
      feature: input.feature,
      provider: provider.name,
      model: 'unknown',
      requestHash,
      latencyMs: Date.now() - started,
      status: timedOut ? 'timeout' : 'error',
      errorCode: cause instanceof Error ? cause.message : 'unknown'
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runEmbeddings(
  inputs: string[],
  options: {profileId?: string | null; feature?: string} = {}
): Promise<number[][] | null> {
  const provider = getAiProvider();
  if (!provider.enabled) return null;
  const feature = options.feature ?? 'embedding.generate';
  const started = Date.now();
  const requestHash = hash({feature, inputs});
  if (!(await withinLimit(options.profileId, feature))) {
    await usage({
      profileId: options.profileId,
      feature,
      provider: provider.name,
      model: 'rate-limit',
      requestHash,
      latencyMs: 0,
      status: 'rate_limited'
    });
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await provider.embed(inputs, controller.signal);
    await usage({
      profileId: options.profileId,
      feature,
      provider: provider.name,
      model: result.model,
      requestHash,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs: Date.now() - started,
      status: 'success'
    });
    return result.vectors;
  } catch (cause) {
    await usage({
      profileId: options.profileId,
      feature,
      provider: provider.name,
      model: 'unknown',
      requestHash,
      latencyMs: Date.now() - started,
      status: cause instanceof Error && cause.name === 'AbortError' ? 'timeout' : 'error',
      errorCode: cause instanceof Error ? cause.message : 'unknown'
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runProofVision(input: {
  profileId?: string | null;
  imageBase64: string;
  mimeType: string;
  expected: {amount: number; currency: string; reference: string | null};
}): Promise<AiVisionResult | null> {
  const provider = getAiProvider();
  if (!provider.enabled) return null;
  const started = Date.now();
  const requestHash = hash({
    feature: 'proof.ocr',
    expected: input.expected,
    mimeType: input.mimeType
  });
  if (!(await withinLimit(input.profileId, 'proof.ocr'))) {
    await usage({
      profileId: input.profileId,
      feature: 'proof.ocr',
      provider: provider.name,
      model: 'rate-limit',
      requestHash,
      latencyMs: 0,
      status: 'rate_limited'
    });
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await provider.analyzeProof(input, controller.signal);
    await usage({
      profileId: input.profileId,
      feature: 'proof.ocr',
      provider: provider.name,
      model: result.model,
      requestHash,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs: Date.now() - started,
      status: 'success'
    });
    return result;
  } catch (cause) {
    await usage({
      profileId: input.profileId,
      feature: 'proof.ocr',
      provider: provider.name,
      model: 'unknown',
      requestHash,
      latencyMs: Date.now() - started,
      status: cause instanceof Error && cause.name === 'AbortError' ? 'timeout' : 'error',
      errorCode: cause instanceof Error ? cause.message : 'unknown'
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
