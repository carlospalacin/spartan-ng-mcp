import { z } from 'zod';
import type { CacheManager } from '../cache/cache-manager.js';
import type { ToolDefinition } from '../server.js';
import { DOCUMENTATION_TOPICS, SPARTAN_DOCS_BASE } from '../utils/constants.js';
import { safeFetch } from '../utils/fetch.js';
import { extractCodeBlocks, extractHeadings, extractLinks, htmlToText } from '../utils/html.js';

export function createDocsTools(cacheManager: CacheManager): ToolDefinition[] {
  return [
    {
      name: 'spartan_docs',
      title: 'Fetch Documentation',
      description:
        'Fetch Spartan documentation topics (installation, CLI, theming, dark-mode, typography, figma, changelog). Returns structured content with code blocks and headings.',
      inputSchema: {
        topic: z.enum(DOCUMENTATION_TOPICS).describe('Documentation topic to fetch'),
        format: z
          .enum(['structured', 'text'])
          .default('structured')
          .describe('Output format: structured (headings + code blocks + links) or plain text'),
      },
      handler: async (args: { topic: string; format?: string }) => {
        const topic = args.topic;
        const format = args.format ?? 'structured';
        const url = `${SPARTAN_DOCS_BASE}/${topic}`;

        const data = await cacheManager.get('docs', topic, async () => {
          const response = await safeFetch(url);
          const html = await response.text();

          if (format === 'text') {
            return {
              topic,
              url,
              content: htmlToText(html),
            };
          }

          return {
            topic,
            url,
            headings: extractHeadings(html),
            codeBlocks: extractCodeBlocks(html),
            links: extractLinks(html),
            text: htmlToText(html),
          };
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    },
  ];
}
