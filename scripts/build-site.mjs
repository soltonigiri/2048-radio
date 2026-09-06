import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const files = [
  'index.html', 'style.css', 'favicon.svg', 'LICENSE',
  ...['app', 'game', 'solver', 'worker', 'audio', 'tracks', 'rhythm', 'motion', 'engine'].map(name => `${name}.js`),
  'engine/2048.wasm',
  'assets/audio/lobby-time.mp3', 'assets/audio/hand-clap.wav', 'assets/audio/sources.json',
];

await rm(output, { recursive: true, force: true });
for (const file of files) {
  const destination = new URL(file, output);
  await mkdir(new URL('./', destination), { recursive: true });
  await copyFile(new URL(file, root), destination);
}
await copyFile(new URL('vendor/2048-ai/LICENSE', root), new URL('engine/LICENSE', output));
await writeFile(new URL('404.html', output), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Not found</h1><a href="/">2048 Radio</a></html>\n');
await writeFile(new URL('_headers', output), `/*
  X-Content-Type-Options: nosniff
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'

/engine/LICENSE
  Content-Type: text/plain; charset=utf-8

/LICENSE
  Content-Type: text/plain; charset=utf-8
`);
console.log('Built static site in dist/');
