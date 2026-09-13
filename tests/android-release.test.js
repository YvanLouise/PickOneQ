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

function config(overrides = {}) {
  return {
    appName: '拾一问', packageName: 'com.pickoneq.app', sourceMode: 'remote', webUrl: 'https://pickoneq.example.com',
    versionName: '0.1.0', versionCode: 1, minSdk: 23, targetSdk: 35, orientation: 'portrait', outputType: 'apk',
    signingMode: 'debug', statusBarColor: '#edf4fb', fullscreen: false, hardwareAcceleration: true, pullToRefresh: true,
    allowHttp: false, updateManifestUrl: '', autoPublish: false, githubRepository: '', githubBranch: 'main', releaseNotes: '',
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
