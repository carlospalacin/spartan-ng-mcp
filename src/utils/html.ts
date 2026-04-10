export interface CodeBlock {
  language: string;
  content: string;
}

export interface Heading {
  level: number;
  text: string;
}

export interface Link {
  href: string;
  text: string;
}

export function htmlToText(html: string): string {
  let text = html;
  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export function extractCodeBlocks(html: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex =
    /<pre[^>]*><code(?:\s+class="[^"]*language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const language = match[1] || 'typescript';
    const content = htmlToText(match[2]);
    if (content.split('\n').length > 1) {
      blocks.push({ language, content });
    }
  }

  return blocks;
}

export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  const regex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: htmlToText(match[2]),
    });
  }

  return headings;
}

export function extractLinks(html: string): Link[] {
  const links: Link[] = [];
  const regex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = htmlToText(match[2]).trim();
    if (href && text) {
      links.push({ href, text });
    }
  }

  return links;
}
