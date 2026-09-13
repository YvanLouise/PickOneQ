import { useRef } from 'react';
import type { AppConfig, SectionKey } from '../types/builder';
import { Icon } from './Icon';

type BuilderHeaderProps = {
  activeSection: SectionKey;
  theme: 'light' | 'dark';
  config: AppConfig;
  onThemeChange: () => void;
  onImport: (config: AppConfig) => void;
  onNotice: (message: string) => void;
};

const headings: Record<SectionKey, [string, string]> = {
  info: ['应用信息', '配置你的应用基本信息'],
  icon: ['应用图标', '设置应用在设备上的品牌图标'],
  splash: ['启动图 & 闪屏', '配置应用启动时的品牌展示'],
  version: ['版本管理', '设置版本号与 Android 兼容范围'],
  permissions: ['权限设置', '配置 WebApp 所需的设备权限'],
  settings: ['其他设置', '调整 WebView 和系统界面行为'],
  signing: ['打包签名', '配置发布版本的签名证书'],
  build: ['打包与发布', '生成 Android 安装包并发布 GitHub Release'],
};

export function BuilderHeader({ activeSection, theme, config, onThemeChange, onImport, onNotice }: BuilderHeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function exportConfig() {
    const safeConfig = { ...config, storePassword: '', keyPassword: '' };
    const blob = new Blob([JSON.stringify(safeConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${config.packageName || 'android-app'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice('配置文件已导出');
  }

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      onImport(JSON.parse(await file.text()) as AppConfig);
    } catch {
      onNotice('配置文件格式无效');
    }
  }

  return (
    <header className="builder-header">
      <div className="builder-header__title">
        <h1>{headings[activeSection][0]}</h1>
        <p>{headings[activeSection][1]}</p>
      </div>
      <div className="builder-header__actions">
        <input ref={fileRef} className="sr-only" type="file" accept="application/json" onChange={(event) => handleFile(event.target.files?.[0])} />
        <button className="button button--quiet" type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="import" size={16} /> 导入配置
        </button>
        <button className="button button--quiet" type="button" onClick={exportConfig}>
          <Icon name="export" size={16} /> 导出配置
        </button>
        <button className="icon-control" type="button" aria-label="切换主题" onClick={onThemeChange}>
          <Icon name={theme === 'light' ? 'sun' : 'moon'} size={19} />
        </button>
      </div>
    </header>
  );
}
