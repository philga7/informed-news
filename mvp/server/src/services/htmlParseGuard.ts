/**
 * Publisher HTML is parsed synchronously (cheerio), which blocks the event loop and starves
 * /healthz (Docker healthcheck timeout is 5s). Bound the work: yield first so queued I/O runs,
 * and cap how much markup is handed to the parser. Article text and meta live near the top.
 */
export const MAX_PARSE_HTML_CHARS = 1_000_000;

export async function prepareHtmlForParse(html: string): Promise<string> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  return html.length > MAX_PARSE_HTML_CHARS ? html.slice(0, MAX_PARSE_HTML_CHARS) : html;
}
