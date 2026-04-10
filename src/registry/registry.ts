import { readFile } from "node:fs/promises";
import { SpartanError, SpartanErrorCode } from "../errors/errors.js";
import {
  type RegistryBlock,
  type RegistryComponent,
  type SpartanRegistry,
  spartanRegistrySchema,
} from "./schema.js";

export interface SearchableItem {
  name: string;
  type: "component" | "block" | "doc";
  category?: string;
  description?: string;
}

export class RegistryLoader {
  private registry: SpartanRegistry | null = null;

  constructor(private registryPath?: string) {}

  async initialize(): Promise<void> {
    // If a custom path is provided, read from file
    if (this.registryPath) {
      return this.loadFromFile(this.registryPath);
    }

    // Default: try to load from the src registry.json (resolved from project root)
    // This works both in dev (src/) and in dist/ if the JSON is copied
    const possiblePaths = [
      new URL("./registry.json", import.meta.url),
      new URL("../../src/registry/registry.json", import.meta.url),
    ];

    for (const pathUrl of possiblePaths) {
      try {
        const raw = await readFile(pathUrl, "utf-8");
        const parsed = JSON.parse(raw);
        this.registry = spartanRegistrySchema.parse(parsed);
        return;
      } catch {
        // Try next path
      }
    }

    // No registry found — use empty
    this.registry = {
      version: "0.0.0",
      generatedAt: new Date().toISOString(),
      spartanVersion: "unknown",
      components: {},
      blocks: {},
      docs: [],
    };
  }

  private async loadFromFile(filePath: string): Promise<void> {
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      this.registry = spartanRegistrySchema.parse(parsed);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        this.registry = {
          version: "0.0.0",
          generatedAt: new Date().toISOString(),
          spartanVersion: "unknown",
          components: {},
          blocks: {},
          docs: [],
        };
        return;
      }
      throw new SpartanError("Failed to load registry", {
        code: SpartanErrorCode.CACHE_READ_ERROR,
        suggestion: "Run 'npm run generate-registry' to create the registry file.",
        cause: error,
      });
    }
  }

  private ensureLoaded(): SpartanRegistry {
    if (!this.registry) {
      throw new SpartanError("Registry not initialized. Call initialize() first.", {
        code: SpartanErrorCode.UNKNOWN_ERROR,
      });
    }
    return this.registry;
  }

  getComponent(name: string): RegistryComponent | null {
    const reg = this.ensureLoaded();
    return reg.components[name.toLowerCase()] ?? null;
  }

  listComponents(): RegistryComponent[] {
    const reg = this.ensureLoaded();
    return Object.values(reg.components);
  }

  listBlocks(): RegistryBlock[] {
    const reg = this.ensureLoaded();
    return Object.values(reg.blocks);
  }

  getBlock(category: string, variant: string): RegistryBlock | null {
    const reg = this.ensureLoaded();
    const key = `${category}/${variant}`;
    return reg.blocks[key] ?? null;
  }

  listDocs(): string[] {
    const reg = this.ensureLoaded();
    return reg.docs;
  }

  getSearchableItems(): SearchableItem[] {
    const reg = this.ensureLoaded();
    const items: SearchableItem[] = [];

    for (const comp of Object.values(reg.components)) {
      items.push({
        name: comp.name,
        type: "component",
        category: comp.category,
        description: `${comp.brainAvailable ? "Brain" : ""}${comp.brainAvailable && comp.helmAvailable ? " + " : ""}${comp.helmAvailable ? "Helm" : ""} component`,
      });
    }

    for (const block of Object.values(reg.blocks)) {
      items.push({
        name: block.variant,
        type: "block",
        category: block.category,
      });
    }

    for (const doc of reg.docs) {
      items.push({
        name: doc,
        type: "doc",
      });
    }

    return items;
  }

  isStale(maxAgeHours = 168): boolean {
    const reg = this.ensureLoaded();
    const generatedAt = new Date(reg.generatedAt).getTime();
    const ageMs = Date.now() - generatedAt;
    return ageMs > maxAgeHours * 60 * 60 * 1000;
  }

  getVersion(): string {
    return this.ensureLoaded().version;
  }

  getSpartanVersion(): string {
    return this.ensureLoaded().spartanVersion;
  }

  getGeneratedAt(): string {
    return this.ensureLoaded().generatedAt;
  }

  getComponentCount(): number {
    return Object.keys(this.ensureLoaded().components).length;
  }

  getBlockCount(): number {
    return Object.keys(this.ensureLoaded().blocks).length;
  }

  /**
   * Replace the in-memory registry with fresh data (used by spartan_registry_refresh).
   * Does NOT write to disk — only updates the runtime state.
   */
  updateRegistry(registry: SpartanRegistry): {
    added: string[];
    updated: string[];
    removed: string[];
  } {
    const old = this.ensureLoaded();
    const oldNames = new Set(Object.keys(old.components));
    const newNames = new Set(Object.keys(registry.components));

    const added = [...newNames].filter((n) => !oldNames.has(n));
    const removed = [...oldNames].filter((n) => !newNames.has(n));
    const updated: string[] = [];

    for (const name of newNames) {
      if (oldNames.has(name)) {
        const oldComp = old.components[name];
        const newComp = registry.components[name];
        if (JSON.stringify(oldComp) !== JSON.stringify(newComp)) {
          updated.push(name);
        }
      }
    }

    this.registry = registry;
    return { added, updated, removed };
  }
}
