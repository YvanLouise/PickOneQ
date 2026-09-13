import { useEffect, useState } from 'react';
import { BuilderHeader } from './components/BuilderHeader';
import { BuilderNav } from './components/BuilderNav';
import { BuilderWorkspace } from './features/builder/BuilderWorkspace';
import { defaultConfig, normalizeUpdateManifestUrl } from './features/builder/defaults';
import type { AppConfig, BuildState, SectionKey } from './types/builder';

const STORAGE_KEY = 'pickoneq-android-release-config-v1';

function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultConfig;
    const imported = JSON.parse(saved) as Partial<AppConfig>;
    return {
      ...defaultConfig,
      ...imported,
      sourceMode: 'remote',
      signingMode: imported.signingMode === 'release' ? 'release' : 'debug',
      outputType: 'apk',
      updateManifestUrl: normalizeUpdateManifestUrl(imported.updateManifestUrl ?? defaultConfig.updateManifestUrl),
    };
  } catch {
    return defaultConfig;
  }
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>('info');
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notice, setNotice] = useState('');
  const [build, setBuild] = useState<BuildState>({
    phase: 'idle',
    progress: 0,
    message: '尚未开始构建',
    logs: [],
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, storePassword: '', keyPassword: '' }));
  }, [config]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function updateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    const nextValue = key === 'updateManifestUrl' ? normalizeUpdateManifestUrl(value) as AppConfig[K] : value;
    setConfig((current) => ({ ...current, [key]: nextValue }));
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  function importConfig(next: AppConfig) {
    setConfig({ ...defaultConfig, ...next, sourceMode: 'remote', signingMode: next.signingMode === 'release' ? 'release' : 'debug', outputType: 'apk', updateManifestUrl: normalizeUpdateManifestUrl(next.updateManifestUrl) });
    showNotice('配置已成功导入');
  }

  return (
    <div className="builder-shell">
      <BuilderNav activeSection={activeSection} onChange={setActiveSection} />
      <div className="builder-main">
        <BuilderHeader
          activeSection={activeSection}
          theme={theme}
          config={config}
          onThemeChange={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          onImport={importConfig}
          onNotice={showNotice}
        />
        <BuilderWorkspace
          activeSection={activeSection}
          config={config}
          build={build}
          onBuildChange={setBuild}
          onConfigChange={updateConfig}
          onSectionChange={setActiveSection}
        />
      </div>
      {notice ? <div className="toast" role="status">{notice}</div> : null}
    </div>
  );
}
