import { SpartanError, SpartanErrorCode } from "../errors/errors.js";
import {
  ANALOG_API_TIMEOUT_MS,
  SPARTAN_ANALOG_API_URL,
  SPARTAN_COMPONENTS_BASE,
} from "../utils/constants.js";
import { safeFetch } from "../utils/fetch.js";
import type {
  AnalogAPIResponse,
  APIInput,
  APIModel,
  APIOutput,
  BrainDirective,
  CodeExample,
  ComponentData,
  HelmComponent,
} from "./types.js";

// In-memory cache for the bulk Analog API response (30 min TTL)
let _apiCache: AnalogAPIResponse | null = null;
let _apiCacheTimestamp = 0;
const API_CACHE_TTL_MS = 30 * 60 * 1000;

export class AnalogApiClient {
  async fetchAll(noCache = false): Promise<AnalogAPIResponse> {
    if (!noCache && _apiCache && Date.now() - _apiCacheTimestamp < API_CACHE_TTL_MS) {
      return _apiCache;
    }

    const response = await safeFetch(SPARTAN_ANALOG_API_URL, {
      timeoutMs: ANALOG_API_TIMEOUT_MS,
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!data.docsData || !data.primitivesData) {
      throw new SpartanError(
        "Analog API returned unexpected shape — missing docsData or primitivesData",
        {
          code: SpartanErrorCode.API_SCHEMA_CHANGED,
          suggestion: "The spartan.ng API may have changed. Check if the MCP needs an update.",
          context: { keys: Object.keys(data) },
        },
      );
    }

    const result = data as unknown as AnalogAPIResponse;
    _apiCache = result;
    _apiCacheTimestamp = Date.now();
    return result;
  }

  async getComponent(name: string, noCache = false): Promise<ComponentData> {
    const api = await this.fetchAll(noCache);

    const docsEntry = api.docsData[name] as Record<string, unknown> | undefined;
    const primitivesEntry = api.primitivesData[name] as Record<string, unknown> | undefined;
    const installEntry = api.manualInstallSnippets?.[name] as Record<string, unknown> | undefined;

    const brainAPI = extractDirectives(docsEntry, "brain");
    const helmAPI = extractComponents(docsEntry, "helm");
    const examples = extractExamples(primitivesEntry);
    const installSnippets = extractInstallSnippets(installEntry);

    return {
      name,
      brainAPI,
      helmAPI,
      examples,
      installSnippets,
      url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
      brainCount: brainAPI.length,
      helmCount: helmAPI.length,
    };
  }

  async listAvailableComponents(): Promise<string[]> {
    const api = await this.fetchAll();
    return Object.keys(api.docsData).sort();
  }
}

function extractDirectives(
  docsEntry: Record<string, unknown> | undefined,
  _layer: "brain",
): BrainDirective[] {
  if (!docsEntry) return [];

  const directives: BrainDirective[] = [];
  const apiData = docsEntry as Record<string, unknown>;

  // Analog API structure: docsData.{component}.brain = { BrnName: { selector, inputs, ... } }
  const brainSection = apiData.brain as Record<string, Record<string, unknown>> | undefined;

  if (brainSection && typeof brainSection === "object" && !Array.isArray(brainSection)) {
    for (const [name, info] of Object.entries(brainSection)) {
      directives.push({
        name,
        selector: String(info.selector ?? ""),
        file: String(info.file ?? ""),
        inputs: extractAPIInputs(info.inputs),
        outputs: extractAPIOutputs(info.outputs),
        models: extractAPIModels(info.models),
      });
    }
  }

  return directives;
}

function extractComponents(
  docsEntry: Record<string, unknown> | undefined,
  _layer: "helm",
): HelmComponent[] {
  if (!docsEntry) return [];

  const components: HelmComponent[] = [];
  const apiData = docsEntry as Record<string, unknown>;

  // Analog API structure: docsData.{component}.helm = { HlmName: { selector, inputs, ... } }
  const helmSection = apiData.helm as Record<string, Record<string, unknown>> | undefined;

  if (helmSection && typeof helmSection === "object" && !Array.isArray(helmSection)) {
    for (const [name, info] of Object.entries(helmSection)) {
      components.push({
        name,
        selector: String(info.selector ?? ""),
        file: String(info.file ?? ""),
        inputs: extractAPIInputs(info.inputs),
        outputs: extractAPIOutputs(info.outputs),
      });
    }
  }

  return components;
}

function extractAPIInputs(raw: unknown): APIInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    name: String(item.name ?? ""),
    type: String(item.type ?? "unknown"),
    default: item.default != null ? String(item.default) : undefined,
    description: item.description != null ? String(item.description) : undefined,
  }));
}

function extractAPIOutputs(raw: unknown): APIOutput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    name: String(item.name ?? ""),
    type: String(item.type ?? "unknown"),
    description: item.description != null ? String(item.description) : undefined,
  }));
}

function extractAPIModels(raw: unknown): APIModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    name: String(item.name ?? ""),
    type: String(item.type ?? "unknown"),
    description: item.description != null ? String(item.description) : undefined,
  }));
}

function extractExamples(primitivesEntry: Record<string, unknown> | undefined): CodeExample[] {
  if (!primitivesEntry) return [];

  const examples: CodeExample[] = [];
  const snippets = primitivesEntry as Record<string, unknown>;

  for (const [variant, value] of Object.entries(snippets)) {
    if (typeof value === "string" && value.trim().length > 0) {
      examples.push({
        variant,
        code: value,
        language: "typescript",
      });
    } else if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.code === "string") {
        examples.push({
          variant,
          code: obj.code,
          language: String(obj.language ?? "typescript"),
        });
      }
    }
  }

  return examples;
}

function extractInstallSnippets(
  installEntry: Record<string, unknown> | undefined,
): Array<{ method: string; command: string }> {
  if (!installEntry) return [];

  const snippets: Array<{ method: string; command: string }> = [];

  for (const [method, command] of Object.entries(installEntry)) {
    if (typeof command === "string") {
      snippets.push({ method, command });
    }
  }

  return snippets;
}
