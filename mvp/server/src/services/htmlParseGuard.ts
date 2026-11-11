/**
 * Publisher HTML is parsed synchronously (cheerio), which blocks the event loop and starves
 * /healthz (Docker healthcheck timeout is 5s). Bound the work: yield first so queued I/O runs,
 * drop <script>/<style> contents (they can be megabytes of JSON on Next.js-style pages and
 * never hold article text), then cap how much markup is handed to the parser.
 */
export const MAX_PARSE_HTML_CHARS = 1_000_000;

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Keeps JSON-LD (small, carries article metadata); strips every other script and all styles. */
function stripScriptsAndStyles(html: string): string {
  return html.replace(SCRIPT_OR_STYLE, (block, tag: string) =>
    tag.toLowerCase() === 'script' && /\btype\s*=\s*["']?application\/ld\+json/i.test(block.slice(0, 200))
      ? block
      : '',
  );
}

export async function prepareHtmlForParse(html: string): Promise<string> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  const stripped = html.length > MAX_PARSE_HTML_CHARS ? stripScriptsAndStyles(html) : html;
  return stripped.length > MAX_PARSE_HTML_CHARS ? stripped.slice(0, MAX_PARSE_HTML_CHARS) : stripped;
}
