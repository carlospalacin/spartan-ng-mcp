import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { ToolDefinition } from '../server.js';

const execFileAsync = promisify(execFile);

const SKILLS_REPO = 'https://github.com/carlospalacin/spartan-ng-skills.git';

const SKILLS_LOCAL_PATHS = [
  // Sibling repo (development)
  join(process.cwd(), '..', 'spartan-ng-skills', '.claude', 'skills', 'spartan'),
  // Bundled with MCP (future)
  join(process.cwd(), 'skills', 'spartan'),
];

async function findLocalSkills(): Promise<string | null> {
  for (const path of SKILLS_LOCAL_PATHS) {
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

async function cloneSkillsRepo(): Promise<string> {
  const tmpDir = join(tmpdir(), `spartan-ng-skills-${Date.now()}`);
  await execFileAsync('git', ['clone', '--depth', '1', SKILLS_REPO, tmpDir], {
    timeout: 30_000,
  });
  return join(tmpDir, '.claude', 'skills', 'spartan');
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
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = await readFile(srcPath, 'utf-8');
      await writeFile(destPath, content, 'utf-8');
      copied.push(destPath);
    }
  }

  return copied;
}

export function createSkillsTools(): ToolDefinition[] {
  return [
    {
      name: 'spartan_install_skills',
      title: 'Install Spartan Skills',
      description:
        "Install Spartan Angular UI skills into a project's .claude/skills/spartan/ directory. Skills teach AI assistants how to correctly use Spartan components — Brain/Helm patterns, composition rules, styling conventions. Fetches from GitHub if not available locally.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe('Target project directory (defaults to current working directory)'),
      },
      handler: async (args: { cwd?: string }) => {
        const targetRoot = args.cwd ?? process.cwd();
        const targetDir = join(targetRoot, '.claude', 'skills', 'spartan');

        // Try local source first, then clone from GitHub
        let skillsSource = await findLocalSkills();
        let clonedTmpDir: string | null = null;

        if (!skillsSource) {
          try {
            skillsSource = await cloneSkillsRepo();
            // Track parent tmp dir for cleanup
            clonedTmpDir = join(
              tmpdir(),
              skillsSource.split(tmpdir() + '/')[1]?.split('/')[0] ?? '',
            );
          } catch (error) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      installed: false,
                      error: `Failed to clone skills repo: ${String(error)}`,
                      repo: SKILLS_REPO,
                      suggestion:
                        'Ensure git is installed and you have internet access. You can also clone manually: git clone ' +
                        SKILLS_REPO,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }

        // Copy skills to target
        const copied = await copyDirRecursive(skillsSource, targetDir);

        // Cleanup temp clone
        if (clonedTmpDir) {
          await rm(clonedTmpDir, { recursive: true, force: true }).catch(() => {});
        }

        const source = clonedTmpDir ? `GitHub (${SKILLS_REPO})` : skillsSource;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  installed: true,
                  targetDir,
                  source,
                  filesInstalled: copied.length,
                  files: copied.map((f) => f.replace(targetRoot + '/', '')),
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
