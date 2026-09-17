import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createUpdateManifest,
  nextReleaseVersion,
  parseGitCredentialOutput,
  publishGitHubRelease,
  sha256,
  validateConfig,
  validateUpdateConfig,
  writeProject,
} from '../tools/android-release/scripts/build-server.mjs';
import {
  appBuildGradleSource,
  assert16kElf,
  cmakeListsSource,
  mainActivitySource,
  readElfLoadAlignments,
} from '../tools/android-release/scripts/build-local-android.mjs';

function config(overrides = {}) {
  return {
    appName: '拾一问', packageName: 'com.pickoneq.app', sourceMode: 'remote', webUrl: 'https://pickoneq.example.com',
    versionName: '0.1.0', versionCode: 1, minSdk: 23, targetSdk: 35, orientation: 'portrait', outputType: 'apk',
    signingMode: 'debug', statusBarColor: '#edf4fb', fullscreen: false, hardwareAcceleration: true, pullToRefresh: true,
    allowHttp: false, updateManifestUrl: 'https://raw.githubusercontent.com/YvanLouise/PickOneQ/main/app-update.json', autoPublish: false, githubRepository: '', githubBranch: 'main', releaseNotes: '',
    permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'], iconDataUrl: '', iconBackground: '#0b3478', iconRadius: 24,
    splashTitle: '拾一问', splashBackground: '#edf4fb', keystorePath: '', keyAlias: '', storePassword: '', keyPassword: '',
    ...overrides,
  };
}

test('remote package validation separates local HTTP builds from online releases', () => {
  assert.equal(validateConfig(config()), null);
  assert.match(validateConfig(config({ webUrl: '' })), /请先填写/);
  assert.match(validateConfig(config({ webUrl: 'http://127.0.0.1:4311', allowHttp: true })), /手机无法访问/);
  assert.match(validateConfig(config({ sourceMode: 'embedded' })), /仅支持远程/);
  assert.match(validateConfig(config({ webUrl: 'http://192.168.1.2:4311' })), /允许 HTTP/);
  assert.equal(validateConfig(config({ webUrl: 'http://192.168.1.2:4311', allowHttp: true })), null);
  assert.match(validateUpdateConfig(config({ autoPublish: true })), /Release 签名/);
});

test('generated Android project contains PickOneQ wrapper and no YiLin runtime', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pickoneq-android-'));
  await writeProject(root, config(), 35);
  const activity = await readFile(path.join(root, 'app/src/main/java/com/pickoneq/app/MainActivity.java'), 'utf8');
  const manifest = await readFile(path.join(root, 'app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(activity, /https:\/\/pickoneq\.example\.com/);
  assert.match(activity, /PickOneQ-Android-Updater/);
  assert.match(activity, /raw\.githubusercontent\.com\/YvanLouise\/PickOneQ\/main\/app-update\.json/);
  assert.match(activity, /addJavascriptInterface\(new UpdateBridge\(\), "PickOneQUpdater"\)/);
  assert.match(activity, /@JavascriptInterface public void checkForUpdate\(\)/);
  assert.match(activity, /getVersionName\(\) \{ return "0\.1\.0"; \}/);
  assert.match(activity, /requestUpdateCheck\(false\)/);
  assert.doesNotMatch(activity, /YiLin|RHVoice|TTS/);
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /com\.pickoneq\.app\.fileprovider/);
});

test('version, credentials, digest and update manifest remain deterministic', () => {
  assert.deepEqual(nextReleaseVersion({ packageName: 'com.pickoneq.app', versionName: '1.2.9', versionCode: 12 }), {
    packageName: 'com.pickoneq.app', currentVersionName: '1.2.9', currentVersionCode: 12, nextVersionName: '1.2.10', nextVersionCode: 13,
  });
  assert.equal(parseGitCredentialOutput('username=test\npassword=secret-token\n'), 'secret-token');
  assert.equal(sha256(Buffer.from('pickoneq')), '10a68364caa89021f59b00055b204a9dc5d7c62a42a608a0c54a5a96902d8e6e');
  assert.equal(createUpdateManifest(config(), 'https://downloads.example/app.apk', 'a'.repeat(64), '2026-09-13T00:00:00.000Z').packageName, 'com.pickoneq.app');
});

test('GitHub publisher creates release, uploads APK and updates both manifests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pickoneq-publish-'));
  const apk = path.join(root, 'pickoneq.apk');
  await writeFile(apk, 'apk-content');
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    if (String(url).includes('/releases/tags/')) return new Response('', { status: 404 });
    if (String(url).endsWith('/releases')) return Response.json({ upload_url: 'https://uploads.example/assets{?name,label}', assets: [] }, { status: 201 });
    if (String(url).startsWith('https://uploads.example/')) return Response.json({ browser_download_url: 'https://downloads.example/pickoneq.apk' }, { status: 201 });
    if ((init.method || 'GET') === 'GET') return new Response('', { status: 404 });
    return Response.json({ content: { sha: 'updated' } }, { status: 200 });
  };
  const result = await publishGitHubRelease(config({
    signingMode: 'release', githubRepository: 'YvanLouise/PickOneQ', updateManifestUrl: 'https://raw.githubusercontent.com/YvanLouise/PickOneQ/main/app-update.json', releaseNotes: '首发',
  }), apk, { token: 'test-token', fetchImpl, apiBase: 'https://api.example' });
  assert.equal(result.tag, 'v0.1.0');
  assert.equal(result.manifest.apkUrl, 'https://downloads.example/pickoneq.apk');
  assert.ok(calls.some((call) => call.url.endsWith('/contents/app-update.json') && call.method === 'PUT'));
  assert.ok(calls.some((call) => call.url.endsWith('/contents/docs/app-update.json') && call.method === 'PUT'));
});

test('local Android launcher is 16 KB-ready and recoverable', () => {
  const activity = mainActivitySource('bundle-test-123');
  assert.match(activity, /BUNDLE_VERSION = "bundle-test-123"/);
  assert.match(activity, /BOOTSTRAP_TIMEOUT_MS = 90000L/);
  assert.match(activity, /pickoneq:\/\/retry/);
  assert.match(activity, /pickoneq:\/\/repair/);
  assert.match(activity, /pickoneq:\/\/restart/);
  assert.match(activity, /startup\.log/);
  assert.match(activity, /deleteRecursively\(target\)/);
  assert.match(cmakeListsSource(), /max-page-size=16384/);
  const gradle = appBuildGradleSource(['arm64-v8a']);
  assert.match(gradle, /ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON/);
  assert.ok(gradle.includes("ndkVersion '28.2.13676358'"));
});

test('ELF guard rejects 4 KB libraries and accepts 16 KB libraries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pickoneq-elf-'));
  const elf = Buffer.alloc(120);
  elf[0] = 0x7f;
  elf.write('ELF', 1, 'ascii');
  elf[4] = 2;
  elf[5] = 1;
  elf.writeBigUInt64LE(64n, 32);
  elf.writeUInt16LE(56, 54);
  elf.writeUInt16LE(1, 56);
  elf.writeUInt32LE(1, 64);
  elf.writeBigUInt64LE(0x4000n, 112);
  const file = path.join(root, 'libnode.so');
  await writeFile(file, elf);
  assert.deepEqual(readElfLoadAlignments(file), [0x4000]);
  assert.deepEqual(assert16kElf(file), [0x4000]);
  elf.writeBigUInt64LE(0x1000n, 112);
  await writeFile(file, elf);
  assert.throws(() => assert16kElf(file), /不兼容 Android 16 KB 页面/);
});

test('android:apk command builds the standalone runtime and keeps remote wrapper separate', async () => {
  const rootPackage = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
  const toolPackage = JSON.parse(await readFile(path.resolve('tools/android-release/package.json'), 'utf8'));
  assert.equal(rootPackage.scripts['android:apk'], 'npm --prefix tools/android-release run build:apk');
  assert.equal(rootPackage.scripts['android:remote-apk'], 'npm --prefix tools/android-release run build:remote-apk');
  assert.match(toolPackage.scripts['build:apk'], /build-local-android\.mjs/);
  assert.match(toolPackage.scripts['build:remote-apk'], /build-local-apk\.mjs/);
});
