import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shouldOpen = !process.argv.includes('--no-open');
const url = 'http://127.0.0.1:5188/';
let devProcess;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  devProcess?.kill();
  process.exit(1);
});

async function main() {
  if (!(await isReachable(url))) {
    devProcess = spawn(process.execPath, [path.join(rootDir, 'scripts', 'dev.mjs')], {
      cwd: rootDir,
      stdio: 'inherit',
      windowsHide: false,
    });
    await waitForServer(url, 30_000);
  }

  if (shouldOpen) openBrowser(url);
  console.log(`Web2APK 已启动：${url}`);
  console.log(devProcess ? '按 Ctrl+C 停止前端与构建服务。' : '检测到服务已在运行。');
}

function openBrowser(targetUrl) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', targetUrl] : [targetUrl];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function isReachable(targetUrl) {
  return new Promise((resolve) => {
    const request = http.get(targetUrl, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.setTimeout(700, () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

async function waitForServer(targetUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(targetUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`开发服务启动超时：${targetUrl}`);
}
