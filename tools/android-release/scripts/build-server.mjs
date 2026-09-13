import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.resolve(toolRoot, '..', '..');
const artifactsRoot = path.join(toolRoot, 'artifacts');
const port = 4174;
const homeRoot = process.env.USERPROFILE || process.env.HOME || appRoot;
const toolRoots = [
  process.env.PICKONEQ_ANDROID_TOOLS,
  path.join(appRoot, '.android-build-tools'),
  path.join(homeRoot, '.pickoneq-android-build-tools'),
  path.join(homeRoot, '.yilin-android-build-tools'),
  path.resolve(appRoot, '..', 'YiLin2', '.android-build-tools'),
].filter(Boolean);

function commandPath(command) {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    return execFileSync(finder, [command], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
  } catch {
    return '';
  }
}

function isWindowsBatch(command) {
  return process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
}

function batchCommand(command, args) {
  const quote = (value) => /\s/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  return ['/d', '/s', '/c', `call ${quote(command)} ${args.map(quote).join(' ')}`];
}

function commandOutput(command, args, env = process.env) {
  if (!command) return '';
  if (isWindowsBatch(command)) {
    try {
      return execFileSync(process.env.ComSpec || 'cmd.exe', batchCommand(command, args), { encoding: 'utf8', windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return `${error.stdout || ''}\n${error.stderr || ''}`;
    }
  }
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, env });
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

function findGradleInWrapperCache() {
  const distsRoot = path.join(homeRoot, '.gradle', 'wrapper', 'dists');
  if (!existsSync(distsRoot)) return '';
  const matches = [];
  try {
    for (const distribution of readdirSync(distsRoot, { withFileTypes: true })) {
      if (!distribution.isDirectory() || !/^gradle-8\./.test(distribution.name)) continue;
      const distributionRoot = path.join(distsRoot, distribution.name);
      for (const hash of readdirSync(distributionRoot, { withFileTypes: true })) {
        if (!hash.isDirectory()) continue;
        const hashRoot = path.join(distributionRoot, hash.name);
        for (const folder of readdirSync(hashRoot, { withFileTypes: true })) {
          if (!folder.isDirectory() || !folder.name.startsWith('gradle-')) continue;
          const executable = path.join(hashRoot, folder.name, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
          if (existsSync(executable)) matches.push(executable);
        }
      }
    }
  } catch {
    return '';
  }
  return matches.sort().at(-1) || '';
}

function resolveJavaPath() {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  return firstExisting([
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', executable),
    ...toolRoots.map((root) => path.join(root, 'jdk', 'bin', executable)),
    commandPath('java'),
  ]);
}

function resolveGradlePath() {
  const executable = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
  return firstExisting([
    process.env.GRADLE_HOME && path.join(process.env.GRADLE_HOME, 'bin', executable),
    ...toolRoots.map((root) => path.join(root, 'gradle', 'bin', executable)),
    findGradleInWrapperCache(),
    commandPath('gradle'),
  ]);
}

function resolveSdkPath() {
  return firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    ...toolRoots.map((root) => path.join(root, 'sdk')),
    process.platform === 'win32' && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  ]);
}

function directories(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function versionFrom(output, expression) {
  return expression.exec(output)?.[1] || '';
}

export function compatibleGradle(version) {
  const [major, minor = 0] = String(version || '').split('.').map(Number);
  return major === 8 && minor >= 13;
}

export function selectCompileSdk(platforms, targetSdk) {
  return platforms.filter((name) => /^android-\d+$/.test(name)).map((name) => Number(name.slice(8)))
    .filter((version) => version >= Math.max(35, targetSdk) && version <= 36).sort((a, b) => a - b)[0] || 0;
}

export function parseGitCredentialOutput(output) {
  const fields = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return typeof fields.password === 'string' ? fields.password.trim() : '';
}

function gitCredentialManagerToken() {
  const git = commandPath('git');
  if (!git) return '';
  const result = spawnSync(git, ['credential-manager', 'get', '--no-ui'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  });
  return result.status === 0 ? parseGitCredentialOutput(result.stdout) : '';
}

export function resolveGitHubAuthentication(options = {}) {
  if (typeof options.token === 'string' && options.token.trim()) return { token: options.token.trim(), source: 'provided' };
  const env = options.env || process.env;
  const environmentToken = env.PICKONEQ_GITHUB_TOKEN;
  if (typeof environmentToken === 'string' && environmentToken.trim()) return { token: environmentToken.trim(), source: 'environment' };
  const credentialToken = (options.credentialLookup || gitCredentialManagerToken)();
  return credentialToken ? { token: credentialToken, source: 'git-credential-manager' } : { token: '', source: 'missing' };
}

export function nextReleaseVersion(manifest) {
  const versionName = typeof manifest?.versionName === 'string' ? manifest.versionName : '0.1.0';
  const versionCode = Number.isInteger(manifest?.versionCode) ? manifest.versionCode : 1;
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(versionName);
  return {
    packageName: typeof manifest?.packageName === 'string' ? manifest.packageName : 'com.pickoneq.app',
    currentVersionName: versionName,
    currentVersionCode: versionCode,
    nextVersionName: match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4]}` : versionName,
    nextVersionCode: versionCode + 1,
  };
}

function localReleaseSuggestion() {
  try {
    const manifest = JSON.parse(readFileSync(path.join(appRoot, 'app-update.json'), 'utf8'));
    if (!manifest.apkUrl) return {
      packageName: manifest.packageName || 'com.pickoneq.app',
      currentVersionName: '0.0.0',
      currentVersionCode: 0,
      nextVersionName: manifest.versionName || '0.1.0',
      nextVersionCode: manifest.versionCode || 1,
    };
    return nextReleaseVersion(manifest);
  } catch {
    return nextReleaseVersion(null);
  }
}

export function inspectEnvironment(targetSdk = 35) {
  const javaPath = resolveJavaPath();
  const gradlePath = resolveGradlePath();
  const sdkPath = resolveSdkPath();
  const javaOutput = commandOutput(javaPath, ['-version']);
  const javaVersion = versionFrom(javaOutput, /version\s+"(\d+(?:\.\d+)*)/i);
  const gradleOutput = commandOutput(gradlePath, ['--version'], javaPath ? { ...process.env, JAVA_HOME: path.dirname(path.dirname(javaPath)) } : process.env);
  const gradleVersion = versionFrom(gradleOutput, /Gradle\s+(\d+(?:\.\d+)*)/i);
  const compileSdk = sdkPath ? selectCompileSdk(directories(path.join(sdkPath, 'platforms')), Number(targetSdk) || 35) : 0;
  const buildTools = sdkPath ? directories(path.join(sdkPath, 'build-tools')).some((name) => /^(35|36)(\.|$)/.test(name)) : false;
  const github = resolveGitHubAuthentication();
  const java = /^17(?:\.|$)/.test(javaVersion);
  const gradle = compatibleGradle(gradleVersion);
  const androidSdk = Boolean(sdkPath && compileSdk);
  const missing = [!java && 'JDK 17', !gradle && 'Gradle 8.13–8.x', !androidSdk && 'Android SDK Platform 35–36', !buildTools && 'Android SDK Build-Tools'].filter(Boolean);
  return {
    ready: missing.length === 0,
    java, gradle, androidSdk, buildTools,
    githubPublisherConfigured: Boolean(github.token),
    githubPublisherSource: github.source,
    releaseSuggestion: localReleaseSuggestion(),
    javaPath, javaVersion, gradlePath, gradleVersion, sdkPath, compileSdk,
    message: missing.length ? `缺少：${missing.join('、')}。请按 docs/android-release.md 配置后重新检查。` : `JDK ${javaVersion} · Gradle ${gradleVersion} · Android API ${compileSdk}`,
  };
}

function isValidUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidGitHubRepository(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value || ''));
}

function hasReleaseSigning(config) {
  return Boolean(config.keystorePath && config.keyAlias && config.storePassword && config.keyPassword);
}

export function validateUpdateConfig(config) {
  if (!config.autoPublish) return null;
  if (config.signingMode !== 'release') return '线上发布必须使用正式 Release 签名';
  if (!isHttpsUrl(config.webUrl)) return '线上发布的拾一问服务地址必须使用 HTTPS';
  if (!isValidGitHubRepository(config.githubRepository)) return 'GitHub 仓库格式应为 owner/repository';
  if (!isHttpsUrl(config.updateManifestUrl)) return '更新清单地址必须使用 HTTPS';
  if (!String(config.releaseNotes || '').trim()) return '请填写本次发布说明';
  return null;
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') return '应用配置无效';
  if (!String(config.appName || '').trim()) return '请填写应用名称';
  if (!/^([a-zA-Z][\w]*\.)+[a-zA-Z][\w]*$/.test(String(config.packageName || ''))) return '应用包名格式不正确';
  if (config.sourceMode !== 'remote') return '拾一问 Android 包仅支持远程 Web 服务模式';
  if (!isValidUrl(config.webUrl)) return '拾一问服务地址必须是 HTTP 或 HTTPS 地址';
  if (String(config.webUrl).startsWith('http:') && !config.allowHttp) return 'HTTP 地址需要开启“允许 HTTP”';
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(config.versionName || ''))) return '版本名称应使用 1.0.0 格式';
  if (!Number.isInteger(config.versionCode) || config.versionCode < 1) return '版本号必须是大于 0 的整数';
  if (!Number.isInteger(config.minSdk) || config.minSdk < 23 || config.minSdk > 35) return '最低 SDK 必须在 23–35 之间';
  if (!Number.isInteger(config.targetSdk) || config.targetSdk < 33 || config.targetSdk > 36) return '目标 SDK 必须在 33–36 之间';
  if (config.signingMode === 'release' && !hasReleaseSigning(config)) return '请完整填写 Release 签名信息';
  if (config.signingMode === 'release' && !existsSync(config.keystorePath)) return 'Release keystore 文件不存在';
  return null;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function escapeGradle(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function escapeJava(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '');
}

function colorLiteral(value, fallback) {
  const normalized = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  return `0xFF${normalized.slice(1).toUpperCase()}`;
}

async function iconAsset(config) {
  const value = String(config.iconDataUrl || '');
  if (value.startsWith('/')) {
    const file = path.resolve(toolRoot, 'public', value.slice(1));
    const relative = path.relative(path.join(toolRoot, 'public'), file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && existsSync(file)) {
      return { extension: path.extname(file).toLowerCase() === '.webp' ? 'webp' : 'png', content: await readFile(file) };
    }
  }
  const match = /^data:image\/(png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const content = Buffer.from(match[2], 'base64');
  if (content.length > 8 * 1024 * 1024) throw new Error('应用图标不能超过 8 MB');
  return { extension: match[1], content };
}

function defaultIconXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#0B3478" android:pathData="M18,0h72a18,18 0,0 1,18 18v72a18,18 0,0 1,-18 18h-72a18,18 0,0 1,-18 -18v-72a18,18 0,0 1,18 -18z" />
  <path android:fillColor="#F7FBFF" android:pathData="M54,19a35,35 0,1 0,0 70a35,35 0,1 0,0 -70M54,29a25,25 0,1 1,0 50a25,25 0,1 1,0 -50" />
  <path android:fillColor="#FFE074" android:pathData="M54,35l5,14l14,5l-14,5l-5,14l-5,-14l-14,-5l14,-5z" />
</vector>`;
}

function androidActivitySource(config) {
  const updateUrl = isHttpsUrl(config.updateManifestUrl) ? String(config.updateManifestUrl) : '';
  const allowHttp = Boolean(config.allowHttp);
  return `package ${config.packageName};

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

public class MainActivity extends Activity {
    private static final String START_URL = "${escapeJava(config.webUrl)}";
    private static final String UPDATE_MANIFEST_URL = "${escapeJava(updateUrl)}";
    private static final int FILE_CHOOSER_REQUEST = 41;
    private WebView webView;
    private SwipeRefreshLayout refreshLayout;
    private View splash;
    private ValueCallback<Uri[]> fileCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(${colorLiteral(config.statusBarColor, '#edf4fb')});
        if (Build.VERSION.SDK_INT >= 23) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        ${config.fullscreen ? 'getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);' : ''}
        createContent();
        if (state == null) webView.loadUrl(START_URL); else webView.restoreState(state);
        if (!UPDATE_MANIFEST_URL.isEmpty()) new Thread(() -> checkForUpdate(false)).start();
    }

    private void createContent() {
        FrameLayout root = new FrameLayout(this);
        refreshLayout = new SwipeRefreshLayout(this);
        webView = new WebView(this);
        refreshLayout.addView(webView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(refreshLayout, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        splash = createSplash();
        root.addView(splash, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " PickOneQAndroid/${escapeJava(config.versionName)}");
        if (Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(${allowHttp ? 'WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE' : 'WebSettings.MIXED_CONTENT_NEVER_ALLOW'});
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || (${allowHttp} && "http".equalsIgnoreCase(scheme))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) { refreshLayout.setRefreshing(false); }
            @Override public void onPageFinished(WebView view, String url) {
                refreshLayout.setRefreshing(false);
                if (splash != null) { splash.animate().alpha(0f).setDuration(220).withEndAction(() -> { ((ViewGroup) splash.getParent()).removeView(splash); splash = null; }).start(); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) Toast.makeText(MainActivity.this, "暂时无法连接拾一问服务", Toast.LENGTH_LONG).show();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                Toast.makeText(MainActivity.this, "安全连接验证失败", Toast.LENGTH_LONG).show();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST); return true; }
                catch (ActivityNotFoundException error) { fileCallback = null; return false; }
            }
        });
        refreshLayout.setEnabled(${Boolean(config.pullToRefresh)});
        refreshLayout.setColorSchemeColors(${colorLiteral(config.iconBackground, '#0b3478')});
        refreshLayout.setOnRefreshListener(() -> webView.reload());
    }

    private View createSplash() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(${colorLiteral(config.splashBackground, '#edf4fb')});
        android.widget.LinearLayout content = new android.widget.LinearLayout(this);
        content.setOrientation(android.widget.LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        ImageView icon = new ImageView(this);
        icon.setImageResource(${config.packageName}.R.drawable.app_icon);
        int iconSize = (int) (96 * getResources().getDisplayMetrics().density);
        content.addView(icon, new android.widget.LinearLayout.LayoutParams(iconSize, iconSize));
        TextView title = new TextView(this);
        title.setText("${escapeJava(config.splashTitle || config.appName)}");
        title.setTextColor(Color.rgb(8, 39, 82));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        android.widget.LinearLayout.LayoutParams titleParams = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = (int) (18 * getResources().getDisplayMetrics().density);
        content.addView(title, titleParams);
        ProgressBar progress = new ProgressBar(this);
        android.widget.LinearLayout.LayoutParams progressParams = new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        progressParams.topMargin = (int) (22 * getResources().getDisplayMetrics().density);
        content.addView(progress, progressParams);
        frame.addView(content, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        return frame;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (webView != null) { webView.stopLoading(); webView.destroy(); } super.onDestroy(); }

    private void checkForUpdate(boolean manual) {
        HttpURLConnection connection = null;
        try {
            connection = openHttps(UPDATE_MANIFEST_URL);
            JSONObject manifest = new JSONObject(readText(connection.getInputStream(), 1024 * 1024));
            if (!getPackageName().equals(manifest.optString("packageName"))) return;
            int remoteVersion = manifest.optInt("versionCode", 0);
            if (remoteVersion <= ${Number(config.versionCode)}) {
                if (manual) runOnUiThread(() -> Toast.makeText(this, "已经是最新版本", Toast.LENGTH_SHORT).show());
                return;
            }
            String apkUrl = manifest.getString("apkUrl");
            String digest = manifest.getString("sha256");
            String versionName = manifest.optString("versionName", "新版本");
            String notes = manifest.optString("notes", "");
            if (!apkUrl.startsWith("https://") || !digest.matches("(?i)[0-9a-f]{64}")) throw new IllegalArgumentException("更新清单无效");
            runOnUiThread(() -> new AlertDialog.Builder(this)
                .setTitle("发现 " + versionName)
                .setMessage(notes.isEmpty() ? "是否下载并安装新版本？" : notes)
                .setNegativeButton("以后再说", null)
                .setPositiveButton("更新", (dialog, which) -> new Thread(() -> downloadAndInstall(apkUrl, digest)).start())
                .show());
        } catch (Exception error) {
            if (manual) runOnUiThread(() -> Toast.makeText(this, "检查更新失败", Toast.LENGTH_SHORT).show());
        } finally { if (connection != null) connection.disconnect(); }
    }

    private void downloadAndInstall(String apkUrl, String expectedDigest) {
        HttpURLConnection connection = null;
        File directory = new File(getCacheDir(), "updates");
        File apk = new File(directory, "pickoneq-update.apk");
        try {
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("无法创建更新目录");
            connection = openHttps(apkUrl);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(apk)) {
                byte[] buffer = new byte[16384]; int count; long total = 0;
                while ((count = input.read(buffer)) != -1) { total += count; if (total > 300L * 1024L * 1024L) throw new IllegalStateException("安装包过大"); output.write(buffer, 0, count); digest.update(buffer, 0, count); }
            }
            if (!toHex(digest.digest()).equalsIgnoreCase(expectedDigest)) throw new SecurityException("安装包校验失败");
            runOnUiThread(() -> installApk(apk));
        } catch (Exception error) {
            if (apk.exists()) apk.delete();
            runOnUiThread(() -> Toast.makeText(this, "更新下载失败：" + error.getMessage(), Toast.LENGTH_LONG).show());
        } finally { if (connection != null) connection.disconnect(); }
    }

    private void installApk(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            Toast.makeText(this, "允许安装未知应用后，请重新打开拾一问完成更新", Toast.LENGTH_LONG).show();
            return;
        }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    private static HttpURLConnection openHttps(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new SecurityException("仅允许 HTTPS 更新地址");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(12000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "PickOneQ-Android-Updater");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
        return connection;
    }

    private static String readText(InputStream input, int maxBytes) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int count;
        while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); if (output.size() > maxBytes) throw new IllegalStateException("响应过大"); }
        return output.toString("UTF-8");
    }
    private static String toHex(byte[] bytes) { StringBuilder output = new StringBuilder(bytes.length * 2); for (byte value : bytes) output.append(String.format("%02x", value)); return output.toString(); }
}`;
}

export async function writeProject(projectRoot, config, compileSdk = Math.max(35, Number(config.targetSdk) || 35), sdkPath = '') {
  const packagePath = config.packageName.split('.').join(path.sep);
  const javaDir = path.join(projectRoot, 'app', 'src', 'main', 'java', packagePath);
  const valuesDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'values');
  const drawableDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'drawable');
  const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
  await Promise.all([javaDir, valuesDir, drawableDir, xmlDir].map((directory) => mkdir(directory, { recursive: true })));

  const allowedPermissions = new Set(['INTERNET', 'ACCESS_NETWORK_STATE', 'POST_NOTIFICATIONS']);
  const selectedPermissions = [...new Set(['INTERNET', 'ACCESS_NETWORK_STATE', 'REQUEST_INSTALL_PACKAGES', ...(config.permissions || []).filter((permission) => allowedPermissions.has(permission))])];
  const permissions = selectedPermissions.map((permission) => `    <uses-permission android:name="android.permission.${permission}" />`).join('\n');
  const orientation = config.orientation === 'unspecified' ? '' : ` android:screenOrientation="${config.orientation}"`;
  const releaseSigning = config.signingMode === 'release' ? `
    signingConfigs {
        release {
            def keystorePath = System.getenv('PICKONEQ_KEYSTORE_PATH')
            if (keystorePath != null && !keystorePath.isEmpty()) storeFile file(keystorePath)
            storePassword System.getenv('PICKONEQ_STORE_PASSWORD')
            keyAlias System.getenv('PICKONEQ_KEY_ALIAS')
            keyPassword System.getenv('PICKONEQ_KEY_PASSWORD')
        }
    }
` : '';
  const releaseSigningConfig = config.signingMode === 'release' ? '\n            signingConfig signingConfigs.release' : '';
  const files = new Map([
    ['settings.gradle', `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = '${escapeGradle(config.appName)}'
include ':app'
`],
    ['build.gradle', `plugins { id 'com.android.application' version '8.13.0' apply false }\n`],
    ['gradle.properties', 'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nandroid.nonTransitiveRClass=true\n'],
    ['app/build.gradle', `plugins { id 'com.android.application' }

android {
    namespace '${escapeGradle(config.packageName)}'
    compileSdk ${compileSdk}
    defaultConfig {
        applicationId '${escapeGradle(config.packageName)}'
        minSdk ${Number(config.minSdk) || 23}
        targetSdk ${Number(config.targetSdk) || 35}
        versionCode ${Number(config.versionCode)}
        versionName '${escapeGradle(config.versionName)}'
    }
${releaseSigning}
    buildTypes {
        release {
            minifyEnabled false${releaseSigningConfig}
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation 'androidx.core:core:1.15.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
}
`],
    ['app/proguard-rules.pro', '# PickOneQ WebView wrapper\n'],
    ['app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissions}
    <application android:allowBackup="false" android:usesCleartextTraffic="${Boolean(config.allowHttp)}" android:hardwareAccelerated="${config.hardwareAcceleration !== false}" android:icon="@drawable/app_icon" android:roundIcon="@drawable/app_icon" android:label="@string/app_name" android:theme="@style/AppTheme">
        <provider android:name="androidx.core.content.FileProvider" android:authorities="${escapeXml(config.packageName)}.fileprovider" android:exported="false" android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_file_paths" />
        </provider>
        <activity android:name=".MainActivity" android:exported="true"${orientation}>
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`],
    ['app/src/main/res/xml/update_file_paths.xml', '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="updates" path="updates/" /></paths>\n'],
    ['app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">${escapeXml(config.appName)}</string></resources>\n`],
    ['app/src/main/res/values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"><item name="android:fontFamily">sans</item><item name="android:windowLightStatusBar">true</item><item name="android:statusBarColor">${escapeXml(config.statusBarColor || '#edf4fb')}</item><item name="android:navigationBarColor">#ffffff</item></style></resources>
`],
    [`app/src/main/java/${config.packageName.split('.').join('/')}/MainActivity.java`, androidActivitySource(config)],
  ]);
  if (sdkPath) files.set('local.properties', `sdk.dir=${sdkPath.replaceAll('\\', '/')}\n`);
  const icon = await iconAsset(config);
  if (icon) files.set(`app/src/main/res/drawable/app_icon.${icon.extension}`, icon.content);
  else files.set('app/src/main/res/drawable/app_icon.xml', defaultIconXml());
  await Promise.all([...files].map(async ([relative, content]) => {
    const destination = path.join(projectRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }));
}

function runCommand(executable, args, cwd, logs, env = process.env) {
  return new Promise((resolve, reject) => {
    const batch = isWindowsBatch(executable);
    const child = spawn(batch ? (process.env.ComSpec || 'cmd.exe') : executable, batch ? batchCommand(executable, args) : args, { cwd, windowsHide: true, env });
    const capture = (chunk) => logs.push(...String(chunk).trim().split(/\r?\n/).filter(Boolean).slice(-40));
    child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} 退出码 ${code}`)));
  });
}

function runGradle(toolchain, projectRoot, logs, config, variant) {
  const environment = {
    ...process.env,
    JAVA_HOME: path.dirname(path.dirname(toolchain.javaPath)),
    ANDROID_HOME: toolchain.sdkPath,
    ANDROID_SDK_ROOT: toolchain.sdkPath,
    ...(config.signingMode === 'release' ? {
      PICKONEQ_KEYSTORE_PATH: config.keystorePath,
      PICKONEQ_STORE_PASSWORD: config.storePassword,
      PICKONEQ_KEY_ALIAS: config.keyAlias,
      PICKONEQ_KEY_PASSWORD: config.keyPassword,
    } : {}),
  };
  return runCommand(toolchain.gradlePath, [`assemble${variant}`, '--no-daemon', '--console=plain'], projectRoot, logs, environment);
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function apiPath(...segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

async function responseJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function githubRequest(fetchImpl, apiBase, pathname, options = {}) {
  const response = await fetchImpl(`${apiBase}${pathname}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${options.token}`, ...(options.headers || {}) },
  });
  if (!response.ok && response.status !== 404) throw new Error(`GitHub API 请求失败（HTTP ${response.status}）`);
  return response;
}

export function createUpdateManifest(config, artifactUrl, digest, publishedAt = new Date().toISOString()) {
  return { packageName: config.packageName, versionCode: config.versionCode, versionName: config.versionName, apkUrl: artifactUrl, sha256: digest, notes: String(config.releaseNotes || '').trim(), publishedAt };
}

async function publishRepositoryFile(fetchImpl, apiBase, owner, repository, branch, filePath, content, message, token) {
  const encodedFilePath = apiPath(...filePath.split('/'));
  const endpoint = `/repos/${apiPath(owner, repository)}/contents/${encodedFilePath}`;
  const existingResponse = await githubRequest(fetchImpl, apiBase, `${endpoint}?ref=${encodeURIComponent(branch)}`, { token });
  const existing = existingResponse.status === 404 ? null : await responseJson(existingResponse);
  const response = await githubRequest(fetchImpl, apiBase, endpoint, {
    token, method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch, ...(existing?.sha ? { sha: existing.sha } : {}) }),
  });
  await responseJson(response);
}

export async function publishGitHubRelease(config, artifactPath, options = {}) {
  const authentication = resolveGitHubAuthentication(options);
  if (!authentication.token) throw new Error('未检测到 PICKONEQ_GITHUB_TOKEN 或 Git Credential Manager 登录凭据');
  if (!isValidGitHubRepository(config.githubRepository)) throw new Error('GitHub 仓库格式应为 owner/repository');
  const [owner, repository] = config.githubRepository.split('/');
  const branch = config.githubBranch || 'main';
  const fetchImpl = options.fetchImpl || fetch;
  const apiBase = options.apiBase || 'https://api.github.com';
  const artifact = await readFile(artifactPath);
  const assetName = path.basename(artifactPath);
  const tag = `v${config.versionName}`;
  let response = await githubRequest(fetchImpl, apiBase, `/repos/${apiPath(owner, repository)}/releases/tags/${encodeURIComponent(tag)}`, { token: authentication.token });
  if (response.status === 404) {
    response = await githubRequest(fetchImpl, apiBase, `/repos/${apiPath(owner, repository)}/releases`, {
      token: authentication.token, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: `${config.appName} ${config.versionName}`, body: String(config.releaseNotes || ''), draft: false, prerelease: false }),
    });
  }
  const release = await responseJson(response);
  if (!release?.upload_url) throw new Error('GitHub Release 响应无效');
  let asset = Array.isArray(release.assets) ? release.assets.find((item) => item.name === assetName) : null;
  if (asset && !options.allowExistingAsset) throw new Error(`GitHub Release ${tag} 已存在同名 APK，请递增版本后重新构建`);
  if (!asset) {
    const uploadUrl = String(release.upload_url).replace(/\{.*$/, '');
    const uploadResponse = await fetchImpl(`${uploadUrl}?name=${encodeURIComponent(assetName)}`, {
      method: 'POST', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${authentication.token}`, 'Content-Type': 'application/vnd.android.package-archive' }, body: artifact,
    });
    if (!uploadResponse.ok) throw new Error(`GitHub APK 上传失败（HTTP ${uploadResponse.status}）`);
    asset = await responseJson(uploadResponse);
  }
  if (!isHttpsUrl(asset?.browser_download_url)) throw new Error('GitHub APK 下载地址无效');
  const manifest = createUpdateManifest(config, asset.browser_download_url, sha256(artifact));
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const message = `release: v${config.versionName}`;
  await publishRepositoryFile(fetchImpl, apiBase, owner, repository, branch, 'app-update.json', manifestContent, message, authentication.token);
  await publishRepositoryFile(fetchImpl, apiBase, owner, repository, branch, 'docs/app-update.json', manifestContent, `${message} (mirror)`, authentication.token);
  return { artifactUrl: asset.browser_download_url, manifest, tag, assetName };
}

async function persistLocalRelease(config, artifactPath, manifest) {
  const releases = path.join(appRoot, 'releases');
  const docs = path.join(appRoot, 'docs');
  await Promise.all([mkdir(releases, { recursive: true }), mkdir(docs, { recursive: true })]);
  await copyFile(artifactPath, path.join(releases, path.basename(artifactPath)));
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await Promise.all([writeFile(path.join(appRoot, 'app-update.json'), content, 'utf8'), writeFile(path.join(docs, 'app-update.json'), content, 'utf8')]);
}

export async function handleBuild(config) {
  const issue = validateConfig(config) || validateUpdateConfig(config);
  if (issue) return { status: 400, body: { message: issue, logs: [`[校验失败] ${issue}`] } };
  const logs = ['[1/4] 应用配置校验通过'];
  const id = randomUUID().slice(0, 8);
  const buildRoot = path.join(artifactsRoot, id);
  const projectRoot = path.join(buildRoot, 'android-project');
  try {
    const environment = inspectEnvironment(Number(config.targetSdk) || 35);
    if (!environment.ready) return { status: 503, body: { message: environment.message, logs: [...logs, environment.message] } };
    await writeProject(projectRoot, config, environment.compileSdk, environment.sdkPath);
    logs.push('[2/4] Android WebView 工程已生成');
    const variant = config.signingMode === 'release' ? 'Release' : 'Debug';
    logs.push(`[3/4] 执行 Gradle assemble${variant}`);
    await runGradle(environment, projectRoot, logs, config, variant);
    const lowerVariant = variant.toLowerCase();
    const source = path.join(projectRoot, 'app', 'build', 'outputs', 'apk', lowerVariant, `app-${lowerVariant}.apk`);
    if (!existsSync(source)) throw new Error(`Gradle 已完成，但未找到 ${variant} APK`);
    const fileName = `${config.packageName}-${config.versionName}-${lowerVariant}.apk`;
    const destination = path.join(buildRoot, fileName);
    await cp(source, destination);
    const artifactUrl = `/api/artifacts/${id}/${encodeURIComponent(fileName)}`;
    logs.push(`[4/${config.autoPublish ? '5' : '4'}] ${variant} APK 构建完成`);
    let publication;
    if (config.autoPublish) {
      logs.push('[5/5] 正在发布 APK 与升级清单到 GitHub');
      try {
        const published = await publishGitHubRelease(config, destination);
        await persistLocalRelease(config, destination, published.manifest);
        logs.push(`[5/5] GitHub 发布完成：${published.tag}`);
        publication = { tag: published.tag, apkUrl: published.artifactUrl, manifestUrl: config.updateManifestUrl, sha256: published.manifest.sha256 };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'GitHub 发布失败';
        logs.push(`[5/5] GitHub 发布失败：${message}`);
        return { status: 502, body: { message: `${message}。本地 APK 已保留，可直接重试发布。`, artifactUrl, projectPath: projectRoot, logs: logs.slice(-100) } };
      }
    }
    await writeFile(path.join(buildRoot, 'build.log'), logs.join('\n'), 'utf8');
    return { status: 200, body: { message: config.autoPublish ? `${variant} APK 已构建并发布` : `${variant} APK 构建完成`, artifactUrl, projectPath: projectRoot, logs: logs.slice(-100), publication } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '构建失败';
    logs.push(`[构建失败] ${message}`);
    await mkdir(buildRoot, { recursive: true });
    await writeFile(path.join(buildRoot, 'build.log'), logs.join('\n'), 'utf8');
    return { status: 500, body: { message, projectPath: projectRoot, logs: logs.slice(-100) } };
  }
}

function resolveArtifactPath(artifactUrl) {
  const pathname = new URL(String(artifactUrl || ''), 'http://127.0.0.1').pathname;
  if (!pathname.startsWith('/api/artifacts/')) throw new Error('本地 APK 地址无效，请重新构建');
  const file = path.resolve(artifactsRoot, decodeURIComponent(pathname.slice('/api/artifacts/'.length)));
  const relative = path.relative(artifactsRoot, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(file) || !statSync(file).isFile()) throw new Error('本地 APK 不存在，请重新构建');
  return file;
}

export async function handleArtifactPublish(config, artifactUrl) {
  const publishConfig = { ...config, sourceMode: 'remote', autoPublish: true };
  const issue = validateConfig(publishConfig) || validateUpdateConfig(publishConfig);
  if (issue) return { status: 400, body: { message: issue } };
  try {
    const artifactPath = resolveArtifactPath(artifactUrl);
    const published = await publishGitHubRelease(publishConfig, artifactPath, { allowExistingAsset: true });
    await persistLocalRelease(publishConfig, artifactPath, published.manifest);
    return { status: 200, body: { message: `GitHub 发布完成：${published.tag}`, publication: { tag: published.tag, apkUrl: published.artifactUrl, manifestUrl: publishConfig.updateManifestUrl, sha256: published.manifest.sha256 } } };
  } catch (error) {
    return { status: 502, body: { message: error instanceof Error ? error.message : 'GitHub 发布失败' } };
  }
}

async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 12_000_000) throw new Error('请求内容过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

export async function startServer() {
  await mkdir(artifactsRoot, { recursive: true });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/api/environment') {
      const targetSdk = Number(url.searchParams.get('targetSdk'));
      json(response, 200, inspectEnvironment(Number.isInteger(targetSdk) ? targetSdk : 35)); return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/artifacts/')) {
      try {
        const file = resolveArtifactPath(url.pathname);
        response.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': `attachment; filename="${path.basename(file)}"` });
        createReadStream(file).pipe(response);
      } catch { json(response, 404, { message: '文件不存在' }); }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/build') {
      try { const result = await handleBuild(await readBody(request)); json(response, result.status, result.body); }
      catch (error) { json(response, 500, { message: error instanceof Error ? error.message : '构建失败' }); }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/publish') {
      try { const body = await readBody(request); const result = await handleArtifactPublish(body.config, body.artifactUrl); json(response, result.status, result.body); }
      catch (error) { json(response, 500, { message: error instanceof Error ? error.message : 'GitHub 发布失败' }); }
      return;
    }
    json(response, 404, { message: 'Not found' });
  });
  server.listen(port, '127.0.0.1', () => console.log(`[pickoneq-release-server] http://127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startServer();
