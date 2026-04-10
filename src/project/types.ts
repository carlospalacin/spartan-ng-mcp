export interface SpartanProjectContext {
  // Angular
  angularVersion: string | null;
  isNxWorkspace: boolean;
  nxVersion: string | null;
  projectType: "application" | "library" | null;
  isZoneless: boolean;

  // Spartan
  installedBrainPackages: string[];
  installedHelmPackages: string[];
  missingPairs: {
    brainWithoutHelm: string[];
    helmWithoutBrain: string[];
  };

  // Tailwind
  tailwindVersion: "v3" | "v4" | null;
  tailwindConfigPath: string | null;
  hasSpartanPreset: boolean;

  // Project
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  srcDir: boolean;
  rootDir: string;
}
