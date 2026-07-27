import { RunIssue } from './types';

export class SourceFetchError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export interface FetchRetryOptions {
  attempts?: number;
  rateLimitDelayMs?: number;
  maxRateLimitDelayMs?: number;
}

export async function fetchWithRetry(
  url: string,
  source: string,
  attemptsOrOptions: number | FetchRetryOptions = 3,
): Promise<Response> {
  const options = typeof attemptsOrOptions === 'number' ? { attempts: attemptsOrOptions } : attemptsOrOptions;
  const attempts = options.attempts ?? 3;
  const rateLimitDelayMs = options.rateLimitDelayMs ?? 2_000;
  const maxRateLimitDelayMs = options.maxRateLimitDelayMs ?? 30_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response;
      lastError = new SourceFetchError(`HTTP ${response.status} ${response.statusText}`, response.status);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = response.status === 429
        ? Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, maxRateLimitDelayMs)
          : Math.min(rateLimitDelayMs * (2 ** (attempt - 1)), maxRateLimitDelayMs)
        : attempt * 2_000;
      if (attempt < attempts) {
        console.warn(`[${source}] HTTP ${response.status}; retrying the same request in ${Math.ceil(delay / 1000)}s (${attempt}/${attempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error;
      if (error instanceof SourceFetchError && error.status && ![429, 500, 502, 503, 504].includes(error.status)) break;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${source} request failed`);
}

export function sourceIssue(source: string, message: string): RunIssue {
  return { stage: 'source_fetch', source, message, recoverable: true };
}
