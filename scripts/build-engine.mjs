import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const upstream = join(root, 'vendor/2048-ai');
const manifest = JSON.parse(readFileSync(join(upstream, 'provenance.json'), 'utf8'));
for (const [name, hash] of Object.entries(manifest.files)) {
  if (createHash('sha256').update(readFileSync(join(upstream, name))).digest('hex') !== hash) throw new Error(`Upstream hash mismatch: ${name}`);
}
const source = readFileSync(join(upstream, '2048.cpp'), 'utf8');
const core = source.slice(source.indexOf('// Transpose rows/columns'), source.indexOf('float score_toplevel_move(board_t board, int move)'));
if (!core.startsWith('// Transpose') || !core.includes('static float _score_toplevel_move')) throw new Error('Upstream extraction markers changed');
const temporary = mkdtempSync(join(tmpdir(), '2048-engine-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed`);
}
try {
  writeFileSync(join(temporary, 'upstream-core.inc'), core);
  const object = join(temporary, 'engine.o');
  run(process.env.CXX || 'clang++', ['--target=wasm32', '-O3', '-std=c++17', '-nostdlib', '-fno-exceptions', '-fno-rtti', '-fno-builtin', '-I', temporary, '-c', 'engine/bridge.cpp', '-o', object]);
  const output = join(root, 'engine/2048.wasm');
  run(process.env.WASM_LD || 'wasm-ld', ['--no-entry', '--allow-undefined', '--strip-all', '--initial-memory=16777216', '--max-memory=16777216', '-z', 'stack-size=1048576', ...['engine_init', 'engine_move', 'engine_heuristic', 'engine_nodes', 'engine_depth', 'engine_choose'].map(name => `--export=${name}`), object, '-o', output]);
  const bytes = readFileSync(output);
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes));
  if (imports.length !== 1 || imports[0].module !== 'env' || imports[0].name !== 'pow') throw new Error(`Unexpected WASM imports: ${JSON.stringify(imports)}`);
  console.log(`Built engine/2048.wasm (${bytes.length} bytes); upstream ${manifest.revision}`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
