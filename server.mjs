import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ...['app', 'game', 'solver', 'worker', 'audio', 'tracks', 'rhythm', 'motion', 'engine'].map(name => [`/${name}.js`, [`${name}.js`, 'text/javascript; charset=utf-8']]),
  ['/engine/2048.wasm', ['engine/2048.wasm', 'application/wasm']],
  ['/engine/LICENSE', ['vendor/2048-ai/LICENSE', 'text/plain; charset=utf-8']],
  ['/assets/audio/lobby-time.mp3', ['assets/audio/lobby-time.mp3', 'audio/mpeg']],
  ['/assets/audio/hand-clap.wav', ['assets/audio/hand-clap.wav', 'audio/wav']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const port = Number(process.env.PORT || 2048);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const entry = files.get(path);
  if (!entry || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const body = await readFile(new URL(entry[0], root));
    const headers = {
      'Content-Type': entry[1], 'Cache-Control': entry[1] === 'audio/mpeg' ? 'private, max-age=3600' : 'no-store',
      'Content-Length': body.length, 'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    };
    if (req.headers.range && req.method === 'GET') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : body.length - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, body.length - Number(match[2])); end = body.length - 1; }
      end = Math.min(end, body.length - 1);
      if (!match || (!match[1] && !match[2]) || start >= body.length || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); res.end(); return;
      }
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${body.length}` });
      res.end(body.subarray(start, end + 1));
    } else {
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    }
  } catch { res.writeHead(500); res.end('Could not load file'); }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`2048 Radio → http://localhost:${port}`);
  console.log(`Serving ${fileURLToPath(root)} on loopback only.`);
});
