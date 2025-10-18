import { describe, expect, it } from 'vitest';
import { formatWechatArticle } from '../src/background/formatter.js';

describe('formatWechatArticle', () => {
  it('renders title, paragraphs, and images with inline styles', () => {
    const html = formatWechatArticle({
      title: '示例标题',
      elements: [
        { type: 'paragraph', content: '第一段内容' },
        { type: 'image', src: 'https://example.com/image.jpg', caption: '图像说明' },
      ],
    });

    expect(html).toContain('<article');
    expect(html).toContain('示例标题');
    expect(html).toContain('第一段内容');
    expect(html).toContain('<img src="https://example.com/image.jpg"');
    expect(html).toContain('图像说明');
  });

  it('coalesces bullet paragraphs into an unordered list', () => {
    const html = formatWechatArticle({
      title: '列表示例',
      elements: [
        { type: 'paragraph', content: '- 第一项' },
        { type: 'paragraph', content: '- 第二项' },
        { type: 'paragraph', content: '结尾段落' },
      ],
    });

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('第一项');
    expect(html).toContain('第二项');
    expect(html).toContain('结尾段落');
  });

  it('detects inline numbered lists within a single paragraph', () => {
    const html = formatWechatArticle({
      title: '编号列表示例',
      elements: [
        { type: 'paragraph', content: '1. 第一条\n2. 第二条\n3. 第三条' },
      ],
    });

    expect(html).toContain('<ol');
    expect(html).toContain('<li');
    expect(html).toContain('第一条');
  });

  it('escapes unsafe HTML content and filters insecure image URLs', () => {
    const html = formatWechatArticle({
      title: '<script>alert(1)</script>',
      elements: [
        { type: 'paragraph', content: '<img src=x onerror=alert(1)>' },
        { type: 'image', src: 'javascript:alert(1)' },
      ],
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:alert');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders quote variants with blockquote styling', () => {
    const html = formatWechatArticle({
      title: '引用示例',
      elements: [
        { type: 'paragraph', content: '引用内容', variant: 'quote' },
      ],
    });

    expect(html).toContain('<blockquote');
    expect(html).toContain('引用内容');
  });

  it('falls back to placeholder text when no elements are provided', () => {
    const html = formatWechatArticle({
      title: '占位符示例',
      elements: [],
    });

    expect(html).toContain('内容正在整理中，请稍后重试');
  });
});
