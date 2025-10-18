import RealtorParser from './realtorParser.js';

const REALTOR_HOSTNAMES = new Set(['www.realtor.com', 'realtor.com']);
const REALTOR_PATH_PREFIXES = ['/news/', '/advice/'];

/**
 * Resolves a parser instance for the provided URL.
 * @param {string} url
 * @param {{ document?: Document }} [options]
 * @returns {import('./realtorParser.js').RealtorParser | null}
 */
export function getParser(url, options = {}) {
  if (!url) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const { hostname, pathname } = parsedUrl;
  const normalizedHost = hostname.toLowerCase();
  const normalizedPath = pathname.toLowerCase();

  if (isRealtorArticle(normalizedHost, normalizedPath)) {
    const doc = options.document ?? globalThis.document;
    if (!doc) {
      throw new Error('Document context is required to initialise the parser.');
    }

    return new RealtorParser(doc, parsedUrl.href);
  }

  return null;
}

/**
 * Determines whether the current URL points to a supported realtor.com article.
 * @param {string} hostname
 * @param {string} pathname
 * @returns {boolean}
 */
function isRealtorArticle(hostname, pathname) {
  if (!REALTOR_HOSTNAMES.has(hostname)) {
    return false;
  }

  return REALTOR_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default getParser;
