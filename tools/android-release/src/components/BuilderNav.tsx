import type { SectionKey } from '../types/builder';
import { Icon, type IconName } from './Icon';

type BuilderNavProps = {
  activeSection: SectionKey;
  onChange: (section: SectionKey) => void;
};

const items: Array<{ key: SectionKey; label: string; icon: IconName }> = [
  { key: 'info', label: '应用信息', icon: 'info' },
  { key: 'icon', label: '应用图标', icon: 'image' },
  { key: 'splash', label: '启动图 & 闪屏', icon: 'splash' },
  { key: 'version', label: '版本管理', icon: 'package' },
  { key: 'permissions', label: '权限设置', icon: 'shield' },
  { key: 'settings', label: '其他设置', icon: 'settings' },
  { key: 'signing', label: '打包签名', icon: 'key' },
  { key: 'build', label: '打包与发布', icon: 'box' },
];

export function BuilderNav({ activeSection, onChange }: BuilderNavProps) {
  return (
    <aside className="builder-nav">
      <div className="builder-brand">
        <span className="builder-brand__mark"><Icon name="android" size={27} /></span>
        <span><strong>拾一问发布工具</strong><small>Android 打包与 GitHub 发布</small></span>
      </div>

      <nav className="builder-nav__items" aria-label="打包配置导航">
        {items.map((item) => (
          <button
            className="builder-nav__item"
            data-active={item.key === activeSection}
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="help-card">
        <span className="help-card__icon"><Icon name="help" size={20} /></span>
        <strong>帮助中心</strong>
        <p>查看本项目的打包与发布说明</p>
        <a href="/ANDROID_RELEASE.md" target="_blank" rel="noreferrer">
          打开指南 <Icon name="external" size={14} />
        </a>
      </div>
    </aside>
  );
}
