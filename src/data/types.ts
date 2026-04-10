export interface APIInput {
  name: string;
  type: string;
  default?: string;
  description?: string;
}

export interface APIOutput {
  name: string;
  type: string;
  description?: string;
}

export interface APIModel {
  name: string;
  type: string;
  description?: string;
}

export interface BrainDirective {
  name: string;
  selector: string;
  file: string;
  inputs: APIInput[];
  outputs: APIOutput[];
  models: APIModel[];
}

export interface CVAVariant {
  name: string;
  values: string[];
  default?: string;
}

export interface HelmComponent {
  name: string;
  selector: string;
  file: string;
  inputs: APIInput[];
  outputs: APIOutput[];
  variants?: CVAVariant[];
  wraps?: string;
}

export interface CodeExample {
  variant: string;
  code: string;
  language: string;
}

export interface InstallSnippet {
  method: string;
  command: string;
}

export interface ComponentData {
  name: string;
  brainAPI: BrainDirective[];
  helmAPI: HelmComponent[];
  examples: CodeExample[];
  installSnippets: InstallSnippet[];
  url: string;
  brainCount: number;
  helmCount: number;
}

export interface SourceFile {
  name: string;
  path: string;
  content: string;
}

export interface BlockData {
  category: string;
  variant: string;
  files: SourceFile[];
  sharedFiles: SourceFile[];
  imports: import('../utils/imports.js').ExtractedImports;
}

export interface GitHubFile {
  content: string;
  sha: string;
  size: number;
  path: string;
}

export interface GitHubEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
  resetAtISO: string;
  hasToken: boolean;
}

export interface AnalogAPIResponse {
  docsData: Record<string, Record<string, unknown>>;
  primitivesData: Record<string, Record<string, unknown>>;
  manualInstallSnippets: Record<string, Record<string, unknown>>;
}
