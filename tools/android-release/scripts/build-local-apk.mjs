import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleBuild } from './build-server.mjs';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configFile = configIndex >= 0 ? path.resolve(args[configIndex + 1] || '') : '';
const publish = args.includes('--publish');

const defaults = {
  appName: '拾一问',
  packageName: 'com.pickoneq.app',
  sourceMode: 'remote',
  webUrl: process.env.PICKONEQ_WEB_URL || '',
  versionName: '0.1.0',
  versionCode: 1,
  description: '通过一个具体问题发现未知，通过自己的回答建立理解。',
  iconDataUrl: '/pickoneq-icon.png',
  iconBackground: '#0b3478',
  iconRadius: 24,
  splashTitle: '拾一问',
  splashBackground: '#edf4fb',
  minSdk: 23,
  targetSdk: 35,
  orientation: 'portrait',
  outputType: 'apk',
  signingMode: 'debug',
  statusBarColor: '#edf4fb',
  fullscreen: false,
  hardwareAcceleration: true,
  pullToRefresh: true,
  allowHttp: false,
  updateManifestUrl: 'https://raw.githubusercontent.com/YvanLouise/PickOneQ/main/app-update.json',
  autoPublish: publish,
  githubRepository: '',
  githubBranch: 'main',
  releaseNotes: '',
  permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
  keystorePath: '',
  keyAlias: '',
  storePassword: '',
  keyPassword: '',
};

if (configFile && !existsSync(configFile)) {
  console.error(`配置文件不存在：${configFile}`);
  process.exit(1);
}

const imported = configFile ? JSON.parse(await readFile(configFile, 'utf8')) : {};
const config = { ...defaults, ...imported, sourceMode: 'remote', autoPublish: publish || imported.autoPublish === true };
const result = await handleBuild(config);
for (const line of result.body.logs || []) console.log(line);
console.log(result.body.message || (result.status === 200 ? '构建完成' : '构建失败'));
if (result.body.artifactUrl) console.log(`本地产物：${result.body.artifactUrl}`);
if (result.body.projectPath) console.log(`Android 工程：${result.body.projectPath}`);
if (result.status !== 200) process.exit(1);
