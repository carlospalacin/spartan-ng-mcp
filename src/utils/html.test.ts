import { describe, expect, it } from 'vitest';
import { extractCodeBlocks, extractHeadings, extractLinks, htmlToText } from './html.js';

describe('htmlToText', () => {
  it('strips HTML tags', () => {
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('removes script and style blocks', () => {
    expect(htmlToText('<script>alert("x")</script>Text<style>.a{}</style>')).toBe('Text');
  });

  it('converts block elements to newlines', () => {
    const result = htmlToText('<p>One</p><p>Two</p>');
    expect(result).toContain('One');
    expect(result).toContain('Two');
  });

  it('converts <br> to newlines', () => {
    expect(htmlToText('A<br>B<br/>C')).toBe('A\nB\nC');
  });

  it('decodes HTML entities', () => {
    expect(htmlToText('&amp; &lt; &gt; &quot; &#39; &nbsp;')).toBe("& < > \" '");
  });

  it('normalizes whitespace', () => {
    expect(htmlToText('  too   many   spaces  ')).toBe('too many spaces');
  });

  it('collapses excessive newlines', () => {
    expect(htmlToText('A\n\n\n\n\nB')).toBe('A\n\nB');
  });

  it('trims result', () => {
    expect(htmlToText('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(htmlToText('')).toBe('');
  });
});

describe('extractCodeBlocks', () => {
  it('extracts code blocks with language', () => {
    const html = '<pre><code class="language-typescript">const x = 1;\nconst y = 2;</code></pre>';
    const blocks = extractCodeBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].content).toContain('const x = 1');
  });

  it('defaults to typescript when no language class', () => {
    const html = '<pre><code>line1\nline2</code></pre>';
    const blocks = extractCodeBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
  });

  it('skips single-line code blocks', () => {
    const html = '<pre><code>single line</code></pre>';
    const blocks = extractCodeBlocks(html);
    expect(blocks).toHaveLength(0);
  });

  it('extracts multiple code blocks', () => {
    const html =
      '<pre><code class="language-html">line1\nline2</code></pre>' +
      '<pre><code class="language-css">a\nb</code></pre>';
    const blocks = extractCodeBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].language).toBe('html');
    expect(blocks[1].language).toBe('css');
  });

  it('returns empty array for no code blocks', () => {
    expect(extractCodeBlocks('<p>No code</p>')).toEqual([]);
  });
});

describe('extractHeadings', () => {
  it('extracts h1-h3 headings', () => {
    const html = '<h1>Title</h1><h2>Section</h2><h3>Sub</h3>';
    const headings = extractHeadings(html);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({ level: 1, text: 'Title' });
    expect(headings[1]).toEqual({ level: 2, text: 'Section' });
    expect(headings[2]).toEqual({ level: 3, text: 'Sub' });
  });

  it('strips HTML inside headings', () => {
    const html = '<h1><a href="#">Link <b>Title</b></a></h1>';
    const headings = extractHeadings(html);
    expect(headings[0].text).toBe('Link Title');
  });

  it('returns empty array for no headings', () => {
    expect(extractHeadings('<p>No headings</p>')).toEqual([]);
  });
});

describe('extractLinks', () => {
  it('extracts links with href and text', () => {
    const html = '<a href="/docs">Documentation</a>';
    const links = extractLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ href: '/docs', text: 'Documentation' });
  });

  it('handles multiple links', () => {
    const html = '<a href="/a">A</a><a href="/b">B</a>';
    const links = extractLinks(html);
    expect(links).toHaveLength(2);
  });

  it('strips HTML from link text', () => {
    const html = '<a href="/x"><b>Bold</b> link</a>';
    const links = extractLinks(html);
    expect(links[0].text).toBe('Bold link');
  });

  it('skips links with empty text', () => {
    const html = '<a href="/x">  </a>';
    const links = extractLinks(html);
    expect(links).toHaveLength(0);
  });

  it('returns empty array for no links', () => {
    expect(extractLinks('<p>No links</p>')).toEqual([]);
  });
});
