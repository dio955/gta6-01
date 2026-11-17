// Solmar Heat — tiny local dev server. Serves the entry directory as static
// files so the game can be played in a desktop browser. Node stdlib only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.cwd(), new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const here = resolve(process.cwd(), fileURLToPath(new URL('.', import.meta.url)));
const serveRoot = here;
void root;

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain; charset=utf-8',
};

const port = Number(process.argv[2] ?? 8904);

const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    let path = normalize(join(serveRoot, raw));
    if (!path.startsWith(serveRoot + sep) && path !== serveRoot) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    if (raw.endsWith('/')) path = join(path, 'game', 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Solmar Heat serving ${serveRoot} at http://127.0.0.1:${port}/`);
});
