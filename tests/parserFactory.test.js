import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { getParser } from '../src/parsers/parserFactory.js';
import { RealtorParser } from '../src/parsers/realtorParser.js';

describe('parserFactory', () => {
  it('returns a RealtorParser instance for supported realtor.com news articles', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://www.realtor.com/news/example-article',
    });

    const parser = getParser(dom.window.location.href, { document: dom.window.document });

    expect(parser).toBeInstanceOf(RealtorParser);
  });

  it('returns null for unsupported realtor.com sections', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://www.realtor.com/about-us',
    });

    const parser = getParser(dom.window.location.href, { document: dom.window.document });

    expect(parser).toBeNull();
  });

  it('returns null for non-realtor domains', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com/news/something',
    });

    const parser = getParser(dom.window.location.href, { document: dom.window.document });

    expect(parser).toBeNull();
  });

  it('throws if a document context is unavailable for a supported URL', () => {
    expect(() => getParser('https://www.realtor.com/advice/buying/sample', { document: undefined })).toThrow(
      'Document context is required to initialise the parser.',
    );
  });

  it('returns null for invalid URL values', () => {
    expect(getParser('not a url', { document: {} })).toBeNull();
  });
});
