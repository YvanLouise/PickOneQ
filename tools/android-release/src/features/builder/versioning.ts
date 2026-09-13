import type { AppConfig } from '../../types/builder';

export type BuildVersionRecord = {
  id: string;
  builtAt: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  signingMode: AppConfig['signingMode'];
  artifactUrl?: string;
};

const historyKey = 'pickoneq-android-build-history-v1';
const maxHistoryEntries = 20;

export function advanceVersion(versionName: string, versionCode: number) {
  const normalizedCode = Number.isInteger(versionCode) && versionCode > 0 ? versionCode : 0;
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(versionName.trim());
  return {
    versionName: match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4]}` : versionName,
    versionCode: normalizedCode + 1,
  };
}

export function loadBuildHistory(): BuildVersionRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isBuildVersionRecord).slice(0, maxHistoryEntries) : [];
  } catch {
    return [];
  }
}

export function recordSuccessfulBuild(config: AppConfig, artifactUrl?: string): BuildVersionRecord {
  const record: BuildVersionRecord = {
    id: `${Date.now()}-${config.versionCode}`,
    builtAt: new Date().toISOString(),
    packageName: config.packageName,
    versionName: config.versionName,
    versionCode: config.versionCode,
    signingMode: config.signingMode,
    artifactUrl,
  };
  try {
    localStorage.setItem(historyKey, JSON.stringify([record, ...loadBuildHistory()].slice(0, maxHistoryEntries)));
  } catch {
    // A successful APK build must not be reported as failed because browser storage is unavailable.
  }
  return record;
}

function isBuildVersionRecord(value: unknown): value is BuildVersionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BuildVersionRecord>;
  return typeof record.id === 'string'
    && typeof record.builtAt === 'string'
    && typeof record.packageName === 'string'
    && typeof record.versionName === 'string'
    && Number.isInteger(record.versionCode)
    && (record.signingMode === 'debug' || record.signingMode === 'release');
}
