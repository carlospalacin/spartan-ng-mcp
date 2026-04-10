import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../server.js";

// Skills content embedded at build time from the spartan-ng-skills repo.
// This avoids runtime dependency on the skills repo location.
// When the skills repo updates, this map should be regenerated.
// For now, we fetch from a known sibling directory or bundled path.

const SKILLS_SOURCE_PATHS = [
  // Sibling repo (development)
  join(process.cwd(), "..", "spartan-ng-skills", ".claude", "skills", "spartan"),
  // Bundled with MCP (production — future)
  join(process.cwd(), "skills", "spartan"),
];

async function findSkillsSource(): Promise<string | null> {
  for (const path of SKILLS_SOURCE_PATHS) {
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

async function copyDirRecursive(src: string, dest: string): Promise<string[]> {
  const copied: string[] = [];
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      const subCopied = await copyDirRecursive(srcPath, destPath);
      copied.push(...subCopied);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const content = await readFile(srcPath, "utf-8");
      await writeFile(destPath, content, "utf-8");
      copied.push(destPath);
    }
  }

  return copied;
}

export function createSkillsTools(): ToolDefinition[] {
  return [
    {
      name: "spartan_install_skills",
      title: "Install Spartan Skills",
      description:
        "Install Spartan Angular UI skills into a project's .claude/skills/spartan/ directory. Skills teach AI assistants how to correctly use Spartan components — Brain/Helm patterns, composition rules, styling conventions.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe("Target project directory (defaults to current working directory)"),
      },
      handler: async (args: { cwd?: string }) => {
        const targetRoot = args.cwd ?? process.cwd();
        const targetDir = join(targetRoot, ".claude", "skills", "spartan");

        // Find skills source
        const skillsSource = await findSkillsSource();
        if (!skillsSource) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    installed: false,
                    error: "Skills source not found.",
                    suggestion:
                      "Ensure the spartan-ng-skills repo is cloned as a sibling directory, or download skills from the repository.",
                    searchedPaths: SKILLS_SOURCE_PATHS,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Copy skills
        const copied = await copyDirRecursive(skillsSource, targetDir);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  installed: true,
                  targetDir,
                  sourceDir: skillsSource,
                  filesInstalled: copied.length,
                  files: copied.map((f) => f.replace(targetRoot + "/", "")),
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    },
  ];
}
