#!/usr/bin/env node
/**
 * build-local-android.mjs — build a LOCAL-mode Debug APK for PickOneQ.
 *
 * LOCAL mode means the Express backend runs INSIDE the Android app via
 * nodejs-mobile (Node 18.20.4). The server listens on 127.0.0.1:4311 and the
 * WebView loads http://127.0.0.1:4311. The whole runtime (dist/, server/,
 * bootstrap.mjs and production node_modules) is embedded as the
 * `nodejs-project` asset and extracted on first launch.
 *
 * This script is intentionally standalone and self-contained. It REUSES the
 * exported `inspectEnvironment()` helper from ./build-server.mjs but NEVER
 * modifies that file (or any other existing file). `build-server.mjs` remains
 * the untouched remote/WebView-wrapper builder; this file only adds the local
 * embedded-Node build path.
 *
 * The generated Gradle project MUST live outside the repository root because
 * the root path contains the non-ASCII directory name "拾一问"; Gradle + the
 * NDK toolchain fail on non-ASCII paths. Therefore everything is generated
 * under `path.join(os.tmpdir(), 'pickoneq-local', <id>)`.
 *
 * Usage:
 *   node tools/android-release/scripts/build-local-android.mjs [options]
 *
 * Options:
 *   --abi <csv>     Comma-separated ABIs (default: arm64-v8a,x86_64)
 *   --skip-gradle   Stage + generate the project only, do not run Gradle
 *   --no-install    Reuse the cached staging node_modules (skip npm install)
 *   --output <dir>  Where to copy the built APK (default: <projectRoot>/releases)
 *   -h, --help      Show this help
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectEnvironment } from './build-server.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(toolRoot, '..', '..');
const localRuntimeDir = path.join(toolRoot, 'local-runtime');
const cacheDir = path.join(toolRoot, '.cache');
const defaultOutput = path.join(projectRoot, 'releases');

const NODE_MOBILE_RELEASE = 'v18.20.4';
const NODE_MOBILE_API = `https://api.github.com/repos/nodejs-mobile/nodejs-mobile/releases/tags/${NODE_MOBILE_RELEASE}`;
const BUILD_ID = process.env.PICKONEQ_LOCAL_BUILD_ID || 'local';

const ANDROID_PACKAGE = 'com.pickoneq.app';
const APP_VERSION_NAME = '0.1.0-local';

function log(message) {
  console.log(`[local-android] ${message}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertExists(target, message) {
  if (!existsSync(target)) throw new Error(message);
}

function printUsage() {
  console.log(`用法：node tools/android-release/scripts/build-local-android.mjs [选项]

选项：
  --abi <csv>     逗号分隔的 ABI（默认：arm64-v8a,x86_64）
  --skip-gradle   仅暂存并生成 Android 工程，不运行 Gradle
  --no-install    复用缓存的 stage/node_modules，跳过 npm install
  --output <dir>  APK 输出目录（默认：<项目根>/releases）
  -h, --help      显示帮助`);
}

function parseArgs(argv) {
  const options = {
    abis: ['arm64-v8a', 'x86_64'],
    skipGradle: false,
    noInstall: false,
    output: defaultOutput,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-gradle') options.skipGradle = true;
    else if (arg === '--no-install') options.noInstall = true;
    else if (arg === '--abi') options.abis = String(argv[++index] || '').split(',');
    else if (arg.startsWith('--abi=')) options.abis = arg.slice('--abi='.length).split(',');
    else if (arg === '--output') options.output = argv[++index] || '';
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    else throw new Error(`未知参数：${arg}（使用 --help 查看用法）`);
  }
  options.abis = options.abis.map((abi) => abi.trim()).filter(Boolean);
  if (!options.abis.length) throw new Error('--abi 至少需要一个 ABI');
  options.output = path.resolve(options.output || defaultOutput);
  return options;
}

/* ------------------------------------------------------------------ *
 * Process helpers (build-server.mjs does not export runCommand, so a
 * minimal Windows-aware copy lives here).
 * ------------------------------------------------------------------ */

function commandPath(command) {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = spawnSync(finder, [command], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return (result.stdout || '').split(/\r?\n/)[0].trim();
  } catch {
    return '';
  }
}

function isWindowsBatch(command) {
  return process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
}

function batchCommand(command, args) {
  const quote = (value) => (/\s/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));
  return ['/d', '/s', '/c', `call ${quote(command)} ${args.map(quote).join(' ')}`];
}

function runCommand(executable, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const batch = isWindowsBatch(executable);
    const child = spawn(batch ? (process.env.ComSpec || 'cmd.exe') : executable, batch ? batchCommand(executable, args) : args, {
      cwd,
      windowsHide: true,
      env,
      // Without verbatim args Node escapes the inner quotes as \" which cmd.exe
      // does not understand (breaks paths containing spaces, e.g. npm.cmd).
      windowsVerbatimArguments: batch,
    });
    const lines = [];
    const capture = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) lines.push(line.trim());
      if (lines.length > 200) lines.splice(0, lines.length - 200);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} 退出码 ${code}\n${lines.slice(-30).join('\n')}`));
    });
  });
}

async function retry(label, attempts, fn) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      log(`${label} 第 ${attempt}/${attempts} 次失败：${error.message}`);
      if (attempt < attempts) await delay(1500 * attempt);
    }
  }
  throw new Error(`${label} 连续失败 ${attempts} 次：${lastError ? lastError.message : '未知错误'}`);
}

function resolveNpm() {
  const candidates = process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'];
  for (const candidate of candidates) {
    const found = commandPath(candidate);
    if (found) return found;
  }
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function findFiles(root, predicate) {
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (predicate(entry.name)) matches.push(full);
    }
  }
  return matches;
}

/* ------------------------------------------------------------------ *
 * Staging: <buildRoot>/stage  ->  assets/nodejs-project/
 * ------------------------------------------------------------------ */

async function stageRuntime(options, buildRoot) {
  const stage = path.join(buildRoot, 'stage');
  const dist = path.join(projectRoot, 'dist');
  const server = path.join(projectRoot, 'server');
  const bootstrap = path.join(localRuntimeDir, 'bootstrap.mjs');
  const credentials = path.join(localRuntimeDir, 'credentials.js');

  assertExists(dist, '缺少 Vite 构建产物 dist/，请先在项目根目录运行 npm run build。');
  assertExists(path.join(dist, 'index.html'), 'dist/index.html 不存在，请先在项目根目录运行 npm run build。');
  assertExists(server, '缺少 server/ 目录。');
  assertExists(path.join(server, 'data', 'sources.json'), '缺少 server/data/sources.json。');
  assertExists(bootstrap, `缺少 ${bootstrap}（应由 local-runtime 任务生成）。`);
  assertExists(credentials, `缺少 ${credentials}（应由 local-runtime 任务生成）。`);

  await mkdir(stage, { recursive: true });
  await rm(path.join(stage, 'dist'), { recursive: true, force: true });
  await rm(path.join(stage, 'server'), { recursive: true, force: true });
  await cp(dist, path.join(stage, 'dist'), { recursive: true });
  await cp(server, path.join(stage, 'server'), { recursive: true });
  // Overwrite the desktop credentials module (imports @napi-rs/keyring) with
  // the Android-safe local-runtime replacement.
  await copyFile(credentials, path.join(stage, 'server', 'credentials.js'));
  await copyFile(bootstrap, path.join(stage, 'bootstrap.mjs'));

  // CRITICAL: never copy the repository package.json (it lists @napi-rs/keyring).
  const stagedPackage = {
    name: 'pickoneq-local',
    private: true,
    type: 'module',
    dependencies: { express: '5.1.0', zod: '3.24.2' },
  };
  await writeFile(path.join(stage, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`, 'utf8');

  const nodeModules = path.join(stage, 'node_modules');
  if (options.noInstall) {
    assertExists(path.join(nodeModules, 'express'), `--no-install 已指定，但缓存中缺少 ${nodeModules}\\express。请先运行一次不带 --no-install 的构建。`);
    assertExists(path.join(nodeModules, 'zod'), `--no-install 已指定，但缓存中缺少 ${nodeModules}\\zod。请先运行一次不带 --no-install 的构建。`);
    log('跳过 npm install（--no-install），复用已缓存的 node_modules');
  } else {
    const npm = resolveNpm();
    log(`安装生产依赖（express 5.1.0 / zod 3.24.2）：${npm}`);
    await retry('npm install', 3, () => runCommand(npm, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage));
  }

  assertExists(path.join(nodeModules, 'express'), `安装后缺少 ${nodeModules}\\express。`);
  assertExists(path.join(nodeModules, 'zod'), `安装后缺少 ${nodeModules}\\zod。`);
  const nativeModules = findFiles(nodeModules, (name) => name.endsWith('.node'));
  if (nativeModules.length) {
    throw new Error(`stage/node_modules 中不应包含原生 .node 模块，但发现：${nativeModules.slice(0, 5).join(', ')}`);
  }
  return stage;
}

/* ------------------------------------------------------------------ *
 * nodejs-mobile v18.20.4 (cached under tools/android-release/.cache)
 * ------------------------------------------------------------------ */

async function resolveNodeMobileAsset() {
  const response = await fetch(NODE_MOBILE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pickoneq-local-build', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub API 请求失败（HTTP ${response.status}）`);
  const release = await response.json();
  const asset = (release.assets || []).find((item) => /android/i.test(item.name) && /\.zip$/i.test(item.name));
  if (!asset) throw new Error(`nodejs-mobile ${NODE_MOBILE_RELEASE} 未找到包含 "android" 且以 .zip 结尾的资源`);
  return asset;
}

async function fetchToFile(url, destination) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'pickoneq-local-build' } });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

// Node's global fetch (undici) ignores HTTP_PROXY/HTTPS_PROXY, so on machines
// behind a proxy it fails with a bare "fetch failed". Fall back to curl /
// PowerShell Invoke-WebRequest, both of which honor the system proxy.
async function downloadFile(url, destination) {
  const failures = [];
  try {
    await fetchToFile(url, destination);
    return;
  } catch (error) {
    failures.push(`fetch: ${error instanceof Error ? error.message : error}`);
  }
  const curl = commandPath('curl') || commandPath('curl.exe');
  if (curl) {
    try {
      await runCommand(curl, ['-L', '--fail', '--retry', '3', '--retry-delay', '2', '-o', destination, url], process.cwd());
      if (existsSync(destination) && statSync(destination).size > 0) return;
      failures.push('curl: 输出为空');
    } catch (error) {
      failures.push(`curl: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (process.platform === 'win32') {
    const powershell = commandPath('powershell.exe') || commandPath('powershell');
    if (powershell) {
      try {
        const quote = (value) => String(value).replaceAll("'", "''");
        const script = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '${quote(url)}' -OutFile '${quote(destination)}'`;
        await runCommand(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], process.cwd());
        if (existsSync(destination) && statSync(destination).size > 0) return;
        failures.push('powershell: 输出为空');
      } catch (error) {
        failures.push(`powershell: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  throw new Error(`下载失败：${failures.join(' | ')}`);
}

function findNodeMobileRoot(directory) {
  if (!existsSync(directory)) return '';
  const queue = [directory];
  while (queue.length) {
    const current = queue.shift();
    if (existsSync(path.join(current, 'include', 'node', 'node.h'))) return current;
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) if (entry.isDirectory()) queue.push(path.join(current, entry.name));
  }
  return '';
}

function extractZip(zip, destination) {
  if (process.platform === 'win32') {
    const quote = (value) => String(value).replaceAll("'", "''");
    const script = `Expand-Archive -LiteralPath '${quote(zip)}' -DestinationPath '${quote(destination)}' -Force`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`解压失败：${(result.stderr || result.stdout || '').trim()}`);
    return;
  }
  const result = spawnSync('unzip', ['-o', zip, '-d', destination], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`解压失败：${(result.stderr || result.stdout || '').trim()}`);
}

async function ensureNodeMobile() {
  await mkdir(cacheDir, { recursive: true });
  const asset = await retry('解析 nodejs-mobile 资源', 3, () => resolveNodeMobileAsset());
  const zipPath = path.join(cacheDir, asset.name);
  if (!existsSync(zipPath) || statSync(zipPath).size === 0) {
    log(`下载 nodejs-mobile ${NODE_MOBILE_RELEASE}：${asset.name}`);
    // Download into an ASCII temp path first: external downloaders (curl,
    // PowerShell) can choke on the non-ASCII repository path, while Node's fs
    // handles the cache copy fine.
    const tempZip = path.join(os.tmpdir(), 'pickoneq-local', asset.name);
    await mkdir(path.dirname(tempZip), { recursive: true });
    await retry('下载 nodejs-mobile', 3, () => downloadFile(asset.browser_download_url, tempZip));
    await mkdir(cacheDir, { recursive: true });
    await copyFile(tempZip, zipPath);
    await rm(tempZip, { force: true });
  } else {
    log(`使用缓存的 nodejs-mobile 压缩包：${zipPath}`);
  }

  const extractDir = path.join(cacheDir, `nodejs-mobile-${NODE_MOBILE_RELEASE}`);
  let root = findNodeMobileRoot(extractDir);
  if (!root) {
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    log(`解压 nodejs-mobile 到 ${extractDir}`);
    extractZip(zipPath, extractDir);
    root = findNodeMobileRoot(extractDir);
  }
  if (!root) throw new Error('解压后未找到 nodejs-mobile 目录结构（缺少 include/node/node.h）');
  return root;
}

/* ------------------------------------------------------------------ *
 * Android project generation
 * ------------------------------------------------------------------ */

function abiFiltersLiteral(abis) {
  return abis.map((abi) => `'${abi}'`).join(', ');
}

function mainActivitySource() {
  return `package ${ANDROID_PACKAGE};

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String LOCAL_ORIGIN = "http://127.0.0.1:4311";
    private static final String BUNDLE_VERSION = "local-1";
    private static final String BUNDLE_ASSET = "nodejs-project";
    private static final int FILE_CHOOSER_REQUEST = 41;
    private static final long BOOTSTRAP_TIMEOUT_MS = 20000L;
    private static final long BOOTSTRAP_POLL_MS = 250L;

    static {
        System.loadLibrary("native-lib");
        System.loadLibrary("node");
    }

    // Static guard: an Activity recreate must never start Node a second time.
    private static boolean started = false;
    private static final Object START_LOCK = new Object();

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private View splash;
    private ValueCallback<Uri[]> fileCallback;

    private native int startNodeWithArguments(String[] arguments, String workingDir);

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(237, 244, 251));
        createContent();
        startNodeOnce();
    }

    private void createContent() {
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splash = createSplash();
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " PickOneQLocal/${APP_VERSION_NAME}");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri == null ? "" : uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideSplash();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    private View createSplash() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(237, 244, 251));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        TextView title = new TextView(this);
        title.setText("\\u62fe\\u4e00\\u95ee");
        title.setTextColor(Color.rgb(8, 39, 82));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        content.addView(title);
        ProgressBar progress = new ProgressBar(this);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        progressParams.topMargin = (int) (22 * getResources().getDisplayMetrics().density);
        content.addView(progress, progressParams);
        frame.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return frame;
    }

    private void startNodeOnce() {
        boolean shouldStart;
        synchronized (START_LOCK) {
            shouldStart = !started;
            if (shouldStart) started = true;
        }
        if (shouldStart) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    String root = ensureProjectExtracted();
                    startNodeWithArguments(new String[] { "node", root + "/bootstrap.mjs", "--production" }, root);
                }
            }, "pickoneq-node").start();
        }
        waitForServerThenLoad();
    }

    private void waitForServerThenLoad() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                long deadline = System.currentTimeMillis() + BOOTSTRAP_TIMEOUT_MS;
                boolean ready = false;
                while (System.currentTimeMillis() < deadline) {
                    if (bootstrapResponds()) {
                        ready = true;
                        break;
                    }
                    try {
                        Thread.sleep(BOOTSTRAP_POLL_MS);
                    } catch (InterruptedException ignored) {
                        break;
                    }
                }
                final boolean ok = ready;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (isFinishing() || webView == null) return;
                        if (ok) webView.loadUrl(LOCAL_ORIGIN);
                        else showStartupError();
                    }
                });
            }
        }, "pickoneq-bootstrap").start();
    }

    private boolean bootstrapResponds() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(LOCAL_ORIGIN + "/api/bootstrap").openConnection();
            connection.setConnectTimeout(1000);
            connection.setReadTimeout(1500);
            connection.setInstanceFollowRedirects(false);
            int status = connection.getResponseCode();
            return status >= 200 && status < 500;
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void hideSplash() {
        final View view = splash;
        if (view == null) return;
        splash = null;
        view.animate().alpha(0f).setDuration(220).withEndAction(new Runnable() {
            @Override
            public void run() {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
            }
        }).start();
    }

    private void showStartupError() {
        hideSplash();
        if (webView == null) return;
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;font-family:sans-serif;background:#edf4fb;color:#082752;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box'>"
                + "<div><h2>\\u62fe\\u4e00\\u95ee\\u672c\\u5730\\u670d\\u52a1\\u542f\\u52a8\\u5931\\u8d25</h2>"
                + "<p>Node \\u670d\\u52a1\\u672a\\u80fd\\u5728 20 \\u79d2\\u5185\\u5c31\\u7eea\\u3002</p>"
                + "<p style='color:#5a6b85;font-size:13px'>\\u8bf7\\u68c0\\u67e5\\u5e94\\u7528\\u5b58\\u50a8\\u7a7a\\u95f4\\u540e\\u91cd\\u8bd5\\u3002</p>"
                + "</div></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private String ensureProjectExtracted() {
        File target = new File(getFilesDir(), BUNDLE_ASSET);
        File marker = new File(target, ".bundle-version");
        if (marker.isFile() && BUNDLE_VERSION.equals(readMarker(marker)) && new File(target, "bootstrap.mjs").isFile()) {
            return target.getAbsolutePath();
        }
        deleteRecursively(target);
        if (!target.exists() && !target.mkdirs()) throw new IllegalStateException("cannot create " + target);
        try {
            copyAssetEntry(getAssets(), BUNDLE_ASSET, target);
            writeMarker(marker);
        } catch (IOException error) {
            throw new IllegalStateException("cannot extract embedded Node project", error);
        }
        return target.getAbsolutePath();
    }

    private static void copyAssetEntry(AssetManager assets, String assetPath, File target) throws IOException {
        String[] children = assets.list(assetPath);
        if (children != null && children.length > 0) {
            if (!target.exists() && !target.mkdirs()) throw new IOException("cannot create " + target);
            for (String child : children) copyAssetEntry(assets, assetPath + "/" + child, new File(target, child));
            return;
        }
        if (target.isDirectory()) return;
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("cannot create " + parent);
        InputStream input = null;
        OutputStream output = null;
        try {
            input = assets.open(assetPath);
            output = new FileOutputStream(target);
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        } finally {
            if (input != null) try { input.close(); } catch (IOException ignored) { }
            if (output != null) try { output.close(); } catch (IOException ignored) { }
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }

    private static String readMarker(File file) {
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), "UTF-8"));
            return reader.readLine();
        } catch (IOException error) {
            return null;
        } finally {
            if (reader != null) try { reader.close(); } catch (IOException ignored) { }
        }
    }

    private static void writeMarker(File file) throws IOException {
        OutputStream output = null;
        try {
            output = new FileOutputStream(file);
            output.write(BUNDLE_VERSION.getBytes("UTF-8"));
        } finally {
            if (output != null) try { output.close(); } catch (IOException ignored) { }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
`;
}

function nativeLibSource() {
  return `#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <android/log.h>
#include "node.h"
#define LOG_TAG "PickOneQNode"
extern "C" JNIEXPORT jint JNICALL
Java_com_pickoneq_app_MainActivity_startNodeWithArguments(JNIEnv* env, jobject /*this*/, jobjectArray arguments, jstring workingDir) {
    jsize argc = env->GetArrayLength(arguments);
    char** argv = (char**) calloc(argc, sizeof(char*));
    for (int i = 0; i < argc; i++) {
        jstring s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char* c = env->GetStringUTFChars(s, nullptr);
        argv[i] = strdup(c);
        env->ReleaseStringUTFChars(s, c); env->DeleteLocalRef(s);
    }
    const char* dir = env->GetStringUTFChars(workingDir, nullptr);
    if (chdir(dir) != 0) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "chdir failed: %s", dir);
    setenv("PICKONEQ_ROOT", dir, 1);
    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "node::Start argc=%d cwd=%s", (int) argc, dir);
    env->ReleaseStringUTFChars(workingDir, dir);
    int result = node::Start((int) argc, argv);
    return (jint) result;
}
`;
}

function cmakeListsSource() {
  return `cmake_minimum_required(VERSION 3.22.1)
project(pickoneq-node)
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION \${CMAKE_SOURCE_DIR}/../jniLibs/\${ANDROID_ABI}/libnode.so)
add_library(native-lib SHARED native-lib.cpp)
target_include_directories(native-lib PRIVATE \${CMAKE_SOURCE_DIR}/include/node)
find_library(log-lib log)
target_link_libraries(native-lib libnode \${log-lib})
`;
}

function appBuildGradleSource(abis) {
  return `plugins { id 'com.android.application' }

android {
    namespace '${ANDROID_PACKAGE}'
    compileSdk 35
    ndkVersion '26.1.10909125'
    defaultConfig {
        applicationId '${ANDROID_PACKAGE}'
        minSdk 24
        targetSdk 35
        versionCode 1
        versionName '${APP_VERSION_NAME}'
        externalNativeBuild { cmake { cppFlags '-std=c++17'; arguments '-DANDROID_STL=c++_shared' } }
        ndk { abiFilters ${abiFiltersLiteral(abis)} }
    }
    externalNativeBuild { cmake { path 'src/main/cpp/CMakeLists.txt'; version '3.22.1' } }
    sourceSets { main { jniLibs.srcDirs 'src/main/jniLibs'; assets.srcDirs 'src/main/assets' } }
    buildTypes {
        debug { debuggable true }
        release { minifyEnabled false }
    }
    packaging { jniLibs { useLegacyPackaging true } }
}
dependencies { implementation 'androidx.core:core:1.15.0' }
`;
}

async function writeAndroidProject(androidProject, options, environment) {
  await rm(androidProject, { recursive: true, force: true });
  const javaDir = path.join(androidProject, 'app', 'src', 'main', 'java', ...ANDROID_PACKAGE.split('.'));
  const files = new Map([
    ['settings.gradle', `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = 'PickOneQLocal'
include ':app'
`],
    ['build.gradle', `plugins { id 'com.android.application' version '8.13.0' apply false }\n`],
    ['gradle.properties', `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
android.overridePathCheck=true
`],
    ['app/build.gradle', appBuildGradleSource(options.abis)],
    ['app/src/main/cpp/CMakeLists.txt', cmakeListsSource()],
    ['app/src/main/cpp/native-lib.cpp', nativeLibSource()],
    [`app/src/main/java/${ANDROID_PACKAGE.split('.').join('/')}/MainActivity.java`, mainActivitySource()],
    ['app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <application
        android:allowBackup="false"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`],
    ['app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">拾一问</string>
</resources>
`],
    ['app/src/main/res/values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:statusBarColor">#edf4fb</item>
        <item name="android:navigationBarColor">#ffffff</item>
    </style>
</resources>
`],
  ]);

  if (environment.sdkPath) {
    files.set('local.properties', `sdk.dir=${environment.sdkPath.replaceAll('\\', '/')}\n`);
  }

  await mkdir(javaDir, { recursive: true });
  for (const [relative, content] of files) {
    const destination = path.join(androidProject, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }
}

async function copyNodeMobileLibs(nodeMobileRoot, androidProject, abis) {
  const binDir = path.join(nodeMobileRoot, 'bin');
  let available = [];
  try {
    available = readdirSync(binDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    available = [];
  }
  for (const abi of abis) {
    const source = path.join(binDir, abi, 'libnode.so');
    if (!existsSync(source)) {
      throw new Error(`nodejs-mobile ${NODE_MOBILE_RELEASE} 不包含 ABI "${abi}"（可用：${available.join(', ') || '无'}）。注意 18.20.4 没有 x86。`);
    }
    const destination = path.join(androidProject, 'app', 'src', 'main', 'jniLibs', abi, 'libnode.so');
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  const includeSource = path.join(nodeMobileRoot, 'include', 'node');
  assertExists(includeSource, 'nodejs-mobile 缺少 include/node 头文件目录');
  await cp(includeSource, path.join(androidProject, 'app', 'src', 'main', 'cpp', 'include', 'node'), { recursive: true });
}

async function copyStagedAssets(stage, androidProject) {
  const destination = path.join(androidProject, 'app', 'src', 'main', 'assets', 'nodejs-project');
  await rm(destination, { recursive: true, force: true });
  await cp(stage, destination, { recursive: true });
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

async function runGradleBuild(environment, androidProject, outputDir) {
  if (!environment.gradlePath) throw new Error('未找到 Gradle 8.x。请设置 GRADLE_HOME 或把 gradle 加入 PATH。');
  if (!environment.sdkPath) throw new Error('未找到 Android SDK。请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。');
  const gradleEnv = { ...process.env, ANDROID_HOME: environment.sdkPath, ANDROID_SDK_ROOT: environment.sdkPath };
  if (environment.javaPath) gradleEnv.JAVA_HOME = path.dirname(path.dirname(environment.javaPath));

  log('运行 Gradle assembleDebug（首次会下载 AGP/NDK/CMake，已接受 SDK 许可）...');
  await runCommand(environment.gradlePath, ['assembleDebug', '--no-daemon', '--console=plain'], androidProject, gradleEnv);

  const source = path.join(androidProject, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  assertExists(source, `Gradle 已完成，但未找到 ${source}`);
  await mkdir(outputDir, { recursive: true });
  const destination = path.join(outputDir, 'pickoneq-local-debug.apk');
  await copyFile(source, destination);
  return destination;
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

function printTree(root, maxDepth) {
  console.log(`目录树（${root}，前 ${maxDepth} 层）：`);
  const walk = (directory, prefix, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      console.log(`${prefix}${last ? '└── ' : '├── '}${entry.name}${entry.isDirectory() ? '/' : ''}`);
      if (entry.isDirectory()) walk(path.join(directory, entry.name), `${prefix}${last ? '    ' : '│   '}`, depth + 1);
    });
  };
  walk(root, '', 1);
}

function reportKeyArtifacts(androidProject) {
  const required = [
    'app/src/main/jniLibs/arm64-v8a/libnode.so',
    'app/src/main/cpp/include/node/node.h',
    'app/src/main/assets/nodejs-project/server/index.js',
    'app/src/main/assets/nodejs-project/dist/index.html',
    'app/src/main/assets/nodejs-project/bootstrap.mjs',
    'app/src/main/assets/nodejs-project/package.json',
    'app/src/main/assets/nodejs-project/node_modules/express',
    'app/src/main/assets/nodejs-project/node_modules/zod',
    'app/src/main/assets/nodejs-project/server/data/sources.json',
  ];
  console.log('关键产物校验：');
  for (const relative of required) {
    const target = path.join(androidProject, relative);
    const present = existsSync(target);
    const size = present && statSync(target).isFile() ? ` (${statSync(target).size} B)` : '';
    console.log(`  ${present ? 'OK  ' : 'MISS'} ${relative}${size}`);
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  log(`LOCAL 模式构建 · ABI：${options.abis.join(', ')}`);

  const environment = inspectEnvironment(35);
  log(`环境：JDK ${environment.javaVersion || '未检测到'} · Gradle ${environment.gradleVersion || '未检测到'} · SDK ${environment.sdkPath || '未检测到'}`);
  if (!options.skipGradle && !environment.ready) log(`环境自检提示：${environment.message}`);

  const buildRoot = path.join(os.tmpdir(), 'pickoneq-local', BUILD_ID);
  const androidProject = path.join(buildRoot, 'android-project');
  await mkdir(buildRoot, { recursive: true });
  log(`构建根目录（ASCII，避免 "拾一问"）：${buildRoot}`);

  const stage = await stageRuntime(options, buildRoot);
  log(`暂存完成：${stage}`);

  const nodeMobileRoot = await ensureNodeMobile();
  log(`nodejs-mobile 目录：${nodeMobileRoot}`);

  await writeAndroidProject(androidProject, options, environment);
  await copyNodeMobileLibs(nodeMobileRoot, androidProject, options.abis);
  await copyStagedAssets(stage, androidProject);
  log(`Android 工程已生成：${androidProject}`);

  let apkPath = '';
  if (options.skipGradle) {
    log('已指定 --skip-gradle：跳过 Gradle 构建');
  } else {
    apkPath = await runGradleBuild(environment, androidProject, options.output);
  }

  console.log('');
  console.log('===== 构建摘要 =====');
  console.log('模式         : LOCAL（内置 Node 18.20.4，监听 127.0.0.1:4311）');
  console.log(`ABI          : ${options.abis.join(', ')}`);
  console.log(`构建根目录   : ${buildRoot}`);
  console.log(`Android 工程 : ${androidProject}`);
  console.log(`暂存目录     : ${stage}`);
  if (apkPath) {
    console.log(`APK          : ${apkPath}`);
    console.log(`APK 大小     : ${(statSync(apkPath).size / (1024 * 1024)).toFixed(2)} MB`);
  } else {
    console.log('APK          : （--skip-gradle：未构建；运行 Gradle 后位于 app/build/outputs/apk/debug/app-debug.apk）');
  }
  console.log('====================');
  console.log('');
  printTree(buildRoot, 3);
  console.log('');
  reportKeyArtifacts(androidProject);
}

main().catch((error) => {
  console.error(`[local-android] 构建失败：${error instanceof Error ? error.message : error}`);
  if (error instanceof Error && error.stack && process.env.PICKONEQ_DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
