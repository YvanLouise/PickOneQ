import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const envFile = path.resolve(root, '..', '..', '.env');
const server = spawn(node, [`--env-file-if-exists=${envFile}`, '--watch', path.join(root, 'scripts', 'build-server.mjs')], { cwd: root, stdio: 'inherit' });
const web = spawn(node, [vite, '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { cwd: root, stdio: 'inherit' });

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  server.kill();
  web.kill();
  process.exitCode = code;
}

server.on('exit', (code) => close(code ?? 0));
web.on('exit', (code) => close(code ?? 0));
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
