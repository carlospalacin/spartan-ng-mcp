export const SpartanErrorCode = {
  // Network
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",
  SSRF_VIOLATION: "SSRF_VIOLATION",

  // Data
  COMPONENT_NOT_FOUND: "COMPONENT_NOT_FOUND",
  BLOCK_NOT_FOUND: "BLOCK_NOT_FOUND",
  DOC_NOT_FOUND: "DOC_NOT_FOUND",
  PARSE_ERROR: "PARSE_ERROR",
  API_SCHEMA_CHANGED: "API_SCHEMA_CHANGED",

  // Project
  NO_ANGULAR_PROJECT: "NO_ANGULAR_PROJECT",
  NO_SPARTAN_INSTALLED: "NO_SPARTAN_INSTALLED",

  // Cache & Registry
  CACHE_READ_ERROR: "CACHE_READ_ERROR",
  CACHE_WRITE_ERROR: "CACHE_WRITE_ERROR",
  REGISTRY_STALE: "REGISTRY_STALE",

  // General
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type SpartanErrorCode = (typeof SpartanErrorCode)[keyof typeof SpartanErrorCode];

export interface SpartanErrorOptions {
  code: SpartanErrorCode;
  suggestion?: string;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class SpartanError extends Error {
  readonly code: SpartanErrorCode;
  readonly suggestion?: string;
  readonly context?: Record<string, unknown>;
  readonly timestamp: Date;

  constructor(message: string, options: SpartanErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "SpartanError";
    this.code = options.code;
    this.suggestion = options.suggestion;
    this.context = options.context;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      suggestion: this.suggestion,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

export function componentNotFound(name: string): SpartanError {
  return new SpartanError(`Unknown component: "${name}"`, {
    code: SpartanErrorCode.COMPONENT_NOT_FOUND,
    suggestion:
      "Use spartan_list to see available components, or spartan_search to find by keyword.",
    context: { name },
  });
}

export function blockNotFound(category: string, variant: string): SpartanError {
  return new SpartanError(`Unknown block: "${category}/${variant}"`, {
    code: SpartanErrorCode.BLOCK_NOT_FOUND,
    suggestion: "Use spartan_list with type='blocks' to see available blocks.",
    context: { category, variant },
  });
}

export function rateLimited(resetAt: number): SpartanError {
  const resetDate = new Date(resetAt).toISOString();
  return new SpartanError(`GitHub API rate limit exceeded. Resets at ${resetDate}.`, {
    code: SpartanErrorCode.RATE_LIMITED,
    suggestion:
      "Set GITHUB_TOKEN environment variable for 5000 requests/hour (no scopes needed for public repos).",
    context: { resetAt, resetAtISO: resetDate },
  });
}

export function ssrfViolation(url: string, hostname: string): SpartanError {
  return new SpartanError(`Blocked request to disallowed host: ${hostname}`, {
    code: SpartanErrorCode.SSRF_VIOLATION,
    context: { url, hostname },
  });
}
