import { Icon } from '../../components/Icon';
import type { AppConfig } from '../../types/builder';

export function AppPreview({ config }: { config: AppConfig }) {
  return (
    <section className="preview-card">
      <h2>应用预览</h2>
      <div className="phone-preview" style={{ background: config.splashBackground }}>
        <div className="phone-preview__status"><strong>9:41</strong><span>▮▮▮ ◉ ▰</span></div>
        <div className="phone-preview__app">
          <span className="app-icon" style={{ background: config.iconBackground, borderRadius: `${config.iconRadius}%` }}>
            {config.iconDataUrl ? <img src={config.iconDataUrl} alt="应用图标" /> : <strong>问</strong>}
          </span>
          <strong>{config.appName || '未命名应用'}</strong>
          <small>v{config.versionName || '1.0.0'}</small>
          <em><Icon name="globe" size={13} /> {config.packageName || 'com.example.app'}</em>
        </div>
      </div>
      <dl className="preview-meta">
        <div><dt>版本</dt><dd>{config.versionName} ({config.versionCode})</dd></div>
        <div><dt>包名</dt><dd>{config.packageName}</dd></div>
        <div><dt>目标平台</dt><dd><span className="android-dot">♟</span> Android</dd></div>
        <div><dt>最低支持</dt><dd>Android {config.minSdk === 23 ? '6.0' : config.minSdk === 26 ? '8.0' : '9.0'} (API {config.minSdk})</dd></div>
        <div><dt>目标 SDK</dt><dd>Android API {config.targetSdk}</dd></div>
        <div><dt>内容来源</dt><dd>远程拾一问服务</dd></div>
      </dl>
    </section>
  );
}
