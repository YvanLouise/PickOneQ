import { Icon } from '../../components/Icon';
import type { AppConfig, BuildState, SectionKey } from '../../types/builder';
import { AppPreview } from './AppPreview';
import { BuildPanel } from './BuildPanel';
import { ConfigPanel } from './ConfigPanel';

type BuilderWorkspaceProps = {
  activeSection: SectionKey;
  config: AppConfig;
  build: BuildState;
  onBuildChange: (state: BuildState) => void;
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSectionChange: (section: SectionKey) => void;
};

export function BuilderWorkspace({ activeSection, config, build, onBuildChange, onConfigChange, onSectionChange }: BuilderWorkspaceProps) {
  return (
    <main className="builder-workspace">
      <div className="builder-workspace__content">
        <ConfigPanel activeSection={activeSection} config={config} onChange={onConfigChange} />
        <button className="tip-banner" type="button" onClick={() => onSectionChange('build')}>
          <Icon name="info" size={15} />
          <span><strong>提示：</strong>请确保已完成所有必填项设置，配置完成后即可一键打包生成安卓应用安装包。</span>
          <Icon name="chevron" size={15} />
        </button>
      </div>
      <aside className="builder-workspace__aside">
        <AppPreview config={config} />
        <BuildPanel config={config} build={build} onBuildChange={onBuildChange} onConfigChange={onConfigChange} />
      </aside>
    </main>
  );
}
