import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { AppConfig, BuildState, EnvironmentState, SectionKey } from '../../types/builder';
import { advanceVersion, loadBuildHistory, recordSuccessfulBuild, type BuildVersionRecord } from './versioning';

const initialEnvironment: EnvironmentState = {
  loading: true,
  ready: false,
  java: false,
  gradle: false,
  androidSdk: false,
  buildTools: false,
  githubPublisherConfigured: false,
  githubPublisherSource: 'missing',
  releaseSuggestion: undefined,
  message: '正在检查本机构建环境…',
};

function validateWebUrl(config: AppConfig): string | null {
  if (!config.webUrl.trim()) return '请先填写已部署的拾一问服务地址';
  try {
    const url = new URL(config.webUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return '拾一问服务地址必须使用 HTTP 或 HTTPS';
    if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return '手机无法访问电脑的 127.0.0.1，请填写线上 HTTPS 地址或电脑的局域网 IP';
    if (url.protocol === 'http:' && !config.allowHttp) return '局域网 HTTP 调试地址需要先在“其他设置”中允许 HTTP';
  } catch {
    return '拾一问服务地址格式不正确，请填写完整地址，例如 https://pickoneq.example.com';
  }
  return null;
}

function validate(config: AppConfig): string | null {
  if (!config.appName.trim()) return '请填写应用名称';
  if (!/^([a-zA-Z][\w]*\.)+[a-zA-Z][\w]*$/.test(config.packageName)) return '应用包名格式不正确';
  const webUrlIssue = validateWebUrl(config);
  if (webUrlIssue) return webUrlIssue;
  if (!Number.isInteger(config.versionCode) || config.versionCode < 1) return '版本号必须是大于 0 的整数';
  if (config.signingMode === 'release' && (!config.keystorePath || !config.keyAlias || !config.storePassword || !config.keyPassword)) return '请完整填写 Release 签名信息';
  return null;
}

type BuildPanelProps = {
  config: AppConfig;
  build: BuildState;
  onBuildChange: (state: BuildState) => void;
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSectionChange: (section: SectionKey) => void;
};

export function BuildPanel({ config, build, onBuildChange, onConfigChange, onSectionChange }: BuildPanelProps) {
  const [environment, setEnvironment] = useState<EnvironmentState>(initialEnvironment);
  const [versionHistory, setVersionHistory] = useState<BuildVersionRecord[]>(loadBuildHistory);
  const busy = build.phase === 'validating' || build.phase === 'building';
  const buildLabel = config.signingMode === 'release' ? 'Release APK' : '测试签名 Debug APK';
  const gradleTask = config.signingMode === 'release' ? 'assembleRelease' : 'assembleDebug';

  function completeVersion(completedConfig: AppConfig, artifactUrl: string | undefined, logs: string[], publication?: BuildState['publication']) {
    const completedVersion = { versionName: completedConfig.versionName, versionCode: completedConfig.versionCode };
    const nextVersion = advanceVersion(completedVersion.versionName, completedVersion.versionCode);
    recordSuccessfulBuild(completedConfig, artifactUrl);
    setVersionHistory(loadBuildHistory());
    onConfigChange('versionName', nextVersion.versionName);
    onConfigChange('versionCode', nextVersion.versionCode);
    const versionLog = `[版本] 已记录 ${completedVersion.versionName} (${completedVersion.versionCode})；下次构建将使用 ${nextVersion.versionName} (${nextVersion.versionCode})`;
    onBuildChange({
      phase: 'success', progress: 100, operation: publication ? 'publish' : 'build',
      message: publication ? `${publication.tag} 已打包并发布` : `Android ${buildLabel} 构建完成`,
      logs: [...logs, versionLog], artifactUrl, publication,
    });
  }

  async function checkEnvironment() {
    setEnvironment(initialEnvironment);
    try {
      const response = await fetch(`/api/environment?targetSdk=${config.targetSdk}`);
      if (!response.ok) throw new Error();
      const data = await response.json() as Omit<EnvironmentState, 'loading'>;
      setEnvironment({ ...data, loading: false });
      if (data.defaultWebUrl && !config.webUrl.trim()) onConfigChange('webUrl', data.defaultWebUrl);
      if (data.releaseSuggestion?.packageName === config.packageName && data.releaseSuggestion.nextVersionCode > config.versionCode) {
        onConfigChange('versionName', data.releaseSuggestion.nextVersionName);
        onConfigChange('versionCode', data.releaseSuggestion.nextVersionCode);
      }
    } catch {
      setEnvironment({ ...initialEnvironment, loading: false, message: '本地构建服务未启动，请运行 npm.cmd run dev' });
    }
  }

  useEffect(() => { void checkEnvironment(); }, [config.packageName, config.targetSdk]);

  async function startBuild(publish: boolean) {
    const repositoryIsValid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.githubRepository);
    const effectiveManifestUrl = config.updateManifestUrl.trim()
      || (repositoryIsValid ? `https://raw.githubusercontent.com/${config.githubRepository}/${config.githubBranch || 'main'}/app-update.json` : '');
    const webUrlIssue = validateWebUrl(config);
    const issue = validate(config)
      || (publish && !environment.githubPublisherConfigured ? '未找到 GitHub 登录凭据，请先通过 Git Credential Manager 登录 GitHub' : null)
      || (publish && config.signingMode !== 'release' ? '线上发布必须使用正式 Release 签名' : null)
      || (publish && !config.webUrl.startsWith('https://') ? '线上发布的拾一问服务地址必须使用 HTTPS' : null)
      || (publish && !repositoryIsValid ? 'GitHub 仓库格式应为 owner/repository' : null)
      || (publish && !effectiveManifestUrl.startsWith('https://') ? '更新清单地址必须使用 HTTPS' : null)
      || (publish && !config.releaseNotes.trim() ? '请填写本次发布说明' : null);
    if (issue) {
      if (issue === webUrlIssue) {
        onSectionChange('info');
        window.setTimeout(() => {
          const field = document.getElementById('pickoneq-web-url') as HTMLInputElement | null;
          field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          field?.focus();
        }, 0);
      }
      onBuildChange({ phase: 'error', progress: 0, operation: publish ? 'publish' : 'build', message: issue, logs: [`[校验失败] ${issue}`] });
      return;
    }
    if (publish && effectiveManifestUrl !== config.updateManifestUrl) onConfigChange('updateManifestUrl', effectiveManifestUrl);
    const requestConfig = { ...config, sourceMode: 'remote' as const, updateManifestUrl: effectiveManifestUrl, autoPublish: publish };
    onBuildChange({ phase: 'validating', progress: 8, operation: publish ? 'publish' : 'build', message: publish ? '正在校验打包与发布配置' : '正在校验应用配置', logs: ['[1/4] 应用配置校验通过', '[2/4] 正在生成 Android WebView 工程…'] });
    let progress = 16;
    const timer = window.setInterval(() => {
      progress = Math.min(progress + Math.ceil((92 - progress) / 9), 92);
      const publishing = publish && progress >= 82;
      onBuildChange({ phase: 'building', progress, operation: publish ? 'publish' : 'build', message: publishing ? '正在签名并发布到 GitHub' : `正在编译 Android ${buildLabel}`, logs: ['[1/4] 应用配置校验通过', '[2/4] Android 工程已生成', `[3/4] Gradle 正在执行 ${gradleTask}，请稍候…`, ...(publishing ? ['[5/5] 等待上传 APK 并更新 app-update.json'] : [])] });
    }, 650);
    try {
      const response = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestConfig) });
      const result = await response.json() as { message?: string; artifactUrl?: string; projectPath?: string; logs?: string[]; publication?: BuildState['publication'] };
      window.clearInterval(timer);
      if (!response.ok) {
        onBuildChange({ phase: 'error', progress: result.artifactUrl ? 92 : 0, operation: publish ? 'publish' : 'build', message: result.message || '构建失败', logs: result.logs || ['构建服务返回错误'], artifactUrl: result.artifactUrl, projectPath: result.projectPath });
        return;
      }
      completeVersion(requestConfig, result.artifactUrl, result.logs || [`${buildLabel} 构建成功`], result.publication);
    } catch {
      window.clearInterval(timer);
      onBuildChange({ phase: 'error', progress: 0, operation: publish ? 'publish' : 'build', message: '无法连接本地构建服务', logs: ['请确认已通过 npm.cmd run dev 启动前端与构建服务'] });
    }
  }

  async function retryPublish() {
    if (!build.artifactUrl) return;
    onBuildChange({ ...build, phase: 'building', progress: 94, operation: 'publish', message: '正在重新发布到 GitHub', logs: [...build.logs, '[重试发布] 复用已构建 APK，不重新编译'] });
    try {
      const response = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { ...config, autoPublish: true }, artifactUrl: build.artifactUrl }) });
      const result = await response.json() as { message?: string; publication?: BuildState['publication'] };
      if (!response.ok || !result.publication) throw new Error(result.message || 'GitHub 发布失败');
      completeVersion(config, build.artifactUrl, [...build.logs, `[重试发布] ${result.message}`], result.publication);
    } catch (error) {
      onBuildChange({ ...build, phase: 'error', progress: 92, operation: 'publish', message: error instanceof Error ? error.message : 'GitHub 发布失败', logs: [...build.logs, '[重试发布] 发布失败，本地 APK 仍已保留'] });
    }
  }

  return (
    <section className="build-card">
      <div className="build-card__head">
        <h2>打包与发布</h2>
        <button className="env-refresh" type="button" aria-label="重新检查环境" onClick={() => void checkEnvironment()}><Icon name="refresh" size={14} /></button>
      </div>
      <div className="environment" data-ready={environment.ready}>
        <span><i /> {environment.loading ? '检查中' : environment.ready ? '构建环境就绪' : '构建环境未就绪'}</span>
        <small>{environment.message}</small>
      </div>
      <div className="build-actions">
        <button className="build-button build-button--secondary" type="button" aria-busy={busy} disabled={busy || !environment.ready} onClick={() => void startBuild(false)}><Icon name="box" size={17} />仅本地打包</button>
        <button className="build-button" type="button" aria-busy={busy} disabled={busy || !environment.ready || !environment.githubPublisherConfigured} onClick={() => void startBuild(true)}>
          <Icon name={busy ? 'refresh' : 'bolt'} size={18} />
          {busy ? build.operation === 'publish' ? '正在打包并发布…' : '正在构建…' : '一键打包并发布'}
        </button>
      </div>
      <p className="build-card__hint">一键发布会生成签名 APK、创建 GitHub Release，并提交 app-update.json 升级清单</p>
      <details className="update-config" open>
        <summary>GitHub 发布设置</summary>
        <div className="publisher-readiness" data-ready={environment.githubPublisherConfigured}><i />{environment.githubPublisherSource === 'git-credential-manager' ? '已复用 Git Credential Manager 登录' : environment.githubPublisherConfigured ? 'GitHub 环境令牌已就绪' : '未找到 GitHub 登录凭据'}</div>
        <label>更新清单 HTTPS 地址<input type="url" value={config.updateManifestUrl} placeholder="留空时根据仓库和分支自动生成" onChange={(event) => onConfigChange('updateManifestUrl', event.target.value)} /></label>
        <label>GitHub 仓库<input value={config.githubRepository} placeholder="owner/repository" onChange={(event) => onConfigChange('githubRepository', event.target.value)} /></label>
        <label>GitHub 分支<input value={config.githubBranch} onChange={(event) => onConfigChange('githubBranch', event.target.value)} /></label>
        <label>本次发布说明<textarea rows={2} value={config.releaseNotes} placeholder="修复内容或新增功能" onChange={(event) => onConfigChange('releaseNotes', event.target.value)} /></label>
        <small>工具优先读取 <code>PICKONEQ_GITHUB_TOKEN</code>；未配置时自动复用当前 Windows Git Credential Manager 的 GitHub 登录，不会把凭据返回前端或写入文件。</small>
        <small>长期远程升级请使用同一个 Release keystore 签名每个版本；Debug 包只适合当前开发机自测。</small>
      </details>

      <div className="build-status" data-phase={build.phase}>
        <div className="build-status__title"><strong>打包状态</strong><span>{build.progress}%</span></div>
        <div className="build-status__body">
          <span className="status-cube"><Icon name={build.phase === 'error' ? 'alert' : build.phase === 'success' ? 'check' : 'box'} size={24} /></span>
          <span><strong>{build.message}</strong><small>{build.logs.at(-1) || '点击上方按钮开始打包'}</small></span>
        </div>
        <div className="progress-track"><span style={{ width: `${build.progress}%` }} /></div>
        {build.artifactUrl ? <a className="download-button" href={build.artifactUrl}><Icon name="download" size={16} /> 下载 {buildLabel}</a> : null}
        {build.phase === 'error' && build.operation === 'publish' && build.artifactUrl ? <button className="retry-publish-button" type="button" onClick={() => void retryPublish()}><Icon name="refresh" size={15} />仅重试 GitHub 发布</button> : null}
        {build.publication ? <div className="publication-result"><span><Icon name="check" size={15} /></span><div><strong>{build.publication.tag} 已发布</strong><small>APK 与 app-update.json 已同步，App 可检测此版本</small></div><div className="publication-result__links"><a href={build.publication.apkUrl} target="_blank" rel="noreferrer">APK 地址</a><a href={build.publication.manifestUrl} target="_blank" rel="noreferrer">更新清单</a></div></div> : null}
        {build.logs.length ? <details className="build-logs"><summary><Icon name="terminal" size={14} /> 查看构建日志</summary><pre>{build.logs.join('\n')}</pre></details> : null}
        {versionHistory.length ? (
          <details className="build-history">
            <summary>版本记录（最近 {Math.min(versionHistory.length, 5)} 次）</summary>
            <ol>
              {versionHistory.slice(0, 5).map((entry) => (
                <li key={entry.id}><span>{entry.versionName} ({entry.versionCode})</span><small>{entry.signingMode === 'release' ? 'Release' : 'Debug'} · {new Date(entry.builtAt).toLocaleString()}</small></li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </section>
  );
}
