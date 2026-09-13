import type { AppConfig } from '../../types/builder';

export const DEFAULT_UPDATE_MANIFEST_URL = '';

export function normalizeUpdateManifestUrl(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized;
}

export const defaultConfig: AppConfig = {
  appName: '拾一问',
  packageName: 'com.pickoneq.app',
  sourceMode: 'remote',
  webUrl: '',
  versionName: '1.0.0',
  versionCode: 1,
  description: '通过一个具体问题发现未知，通过自己的回答建立理解。',
  developerName: '',
  developerEmail: '',
  website: '',
  category: '教育',
  keywords: '跨学科,知识探索,学习,AI,问题',
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
  updateManifestUrl: DEFAULT_UPDATE_MANIFEST_URL,
  autoPublish: false,
  githubRepository: '',
  githubBranch: 'main',
  releaseNotes: '',
  permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
  keystorePath: '',
  keyAlias: '',
  storePassword: '',
  keyPassword: '',
};
