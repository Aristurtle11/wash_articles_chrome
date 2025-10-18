import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { RealtorParser } from '../src/parsers/realtorParser.js';

describe('RealtorParser', () => {
  it('extracts content from __NEXT_DATA__ payloads', async () => {
    const nextData = {
      props: {
        pageProps: {
          post: {
            featuredImage: {
              node: {
                sourceUrl: 'https://cdn.example.com/images/cover.jpg',
              },
            },
            editorBlocks: [
              {
                __typename: 'CoreParagraph',
                renderedHtml: '<p>First paragraph from blocks.</p>',
              },
              {
                __typename: 'CoreHeading',
                attributes: {
                  content: 'Section Heading',
                },
              },
              {
                __typename: 'CoreImage',
                attributes: {
                  src: '/media/photo.jpg',
                },
              },
            ],
          },
        },
      },
    };

    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head>
          <script id="__NEXT_DATA__" type="application/json">
            ${JSON.stringify(nextData).replace(/</g, '\\u003C')}
          </script>
        </head>
        <body></body>
      </html>`,
      { url: 'https://www.realtor.com/news/example-article' },
    );

    const parser = new RealtorParser(dom.window.document, dom.window.location.href);
    const result = await parser.extract();

    expect(result).toEqual([
      { type: 'image', src: 'https://cdn.example.com/images/cover.jpg', isCover: true },
      { type: 'paragraph', content: 'First paragraph from blocks.' },
      { type: 'paragraph', content: 'Section Heading' },
      { type: 'image', src: 'https://www.realtor.com/media/photo.jpg' },
    ]);
  });

  it('falls back to DOM parsing when __NEXT_DATA__ is unavailable', async () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head>
          <meta property="og:image" content="/assets/cover.png">
        </head>
        <body>
          <article class="article-body">
            <p>Intro paragraph.</p>
            <figure>
              <img src="https://cdn.example.com/image-1.png" alt="Hero">
            </figure>
            <p>Second paragraph with more details.</p>
          </article>
        </body>
      </html>`,
      { url: 'https://www.realtor.com/advice/buying/example' },
    );

    const parser = new RealtorParser(dom.window.document, dom.window.location.href);
    const result = await parser.extract();

    expect(result).toEqual([
      { type: 'image', src: 'https://www.realtor.com/assets/cover.png', isCover: true },
      { type: 'paragraph', content: 'Intro paragraph.' },
      { type: 'image', src: 'https://cdn.example.com/image-1.png' },
      { type: 'paragraph', content: 'Second paragraph with more details.' },
    ]);
  });

  it('throws an error when no content can be extracted', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div>Irrelevant</div></body></html>', {
      url: 'https://www.realtor.com/news/empty',
    });

    const parser = new RealtorParser(dom.window.document, dom.window.location.href);

    await expect(parser.extract()).rejects.toThrow(
      'Failed to extract content. The website structure may have changed.',
    );
  });
});
