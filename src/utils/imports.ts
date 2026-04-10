export interface ExtractedImports {
  spartan: string[];
  angular: string[];
  cdk: string[];
  other: string[];
}

export function extractImportsFromSource(source: string): ExtractedImports {
  const spartan: Set<string> = new Set();
  const angular: Set<string> = new Set();
  const cdk: Set<string> = new Set();
  const other: Set<string> = new Set();

  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    const items = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const from = match[2];

    for (const item of items) {
      const name = item.replace(/\s+as\s+\w+/, "").trim();
      if (!name) continue;

      if (from.includes("@spartan-ng/")) {
        spartan.add(name);
      } else if (from.includes("@angular/cdk")) {
        cdk.add(name);
      } else if (from.includes("@angular/")) {
        angular.add(name);
      } else if (!from.startsWith(".") && !from.startsWith("/")) {
        other.add(name);
      }
    }
  }

  return {
    spartan: [...spartan].sort(),
    angular: [...angular].sort(),
    cdk: [...cdk].sort(),
    other: [...other].sort(),
  };
}

export function extractExportsFromIndex(content: string): string[] {
  const exports: Set<string> = new Set();

  // export * from './lib/something'
  const reExportRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = reExportRegex.exec(content)) !== null) {
    exports.add(match[1]);
  }

  // export { Name, Other } from '...'
  const namedExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = namedExportRegex.exec(content)) !== null) {
    const items = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const item of items) {
      exports.add(item.replace(/\s+as\s+\w+/, "").trim());
    }
  }

  // export const NAME
  const constExportRegex = /export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g;
  while ((match = constExportRegex.exec(content)) !== null) {
    exports.add(match[1]);
  }

  return [...exports];
}
