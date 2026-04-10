import { SpartanError, SpartanErrorCode, ssrfViolation } from "../errors/errors.js";
import { ALLOWED_HOSTS, DEFAULT_FETCH_TIMEOUT_MS } from "./constants.js";

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  skipSsrfCheck?: boolean;
}

export async function safeFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, headers = {}, skipSsrfCheck = false } = options;

  if (!skipSsrfCheck) {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw ssrfViolation(url, parsed.hostname);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "spartan-ng-mcp/2.0",
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SpartanError(`HTTP ${response.status} ${response.statusText}: ${url}`, {
        code: SpartanErrorCode.NETWORK_ERROR,
        context: { url, status: response.status },
      });
    }

    return response;
  } catch (error) {
    if (error instanceof SpartanError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SpartanError(`Request timed out after ${timeoutMs}ms: ${url}`, {
        code: SpartanErrorCode.TIMEOUT,
        context: { url, timeoutMs },
        cause: error,
      });
    }

    throw new SpartanError(`Network error fetching ${url}: ${String(error)}`, {
      code: SpartanErrorCode.NETWORK_ERROR,
      context: { url },
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}
