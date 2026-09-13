import { useRef } from 'react';
import { Field, Toggle } from '../../components/FormControls';
import { Icon } from '../../components/Icon';
import type { AppConfig, SectionKey } from '../../types/builder';

type ConfigPanelProps = {
  activeSection: SectionKey;
  config: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const permissionOptions = [
  ['INTERNET', '网络访问', '连接拾一问服务并调用 AI'],
  ['ACCESS_NETWORK_STATE', '网络状态', '判断设备当前是否联网'],
  ['POST_NOTIFICATIONS', '通知', 'Android 13 及以上发送通知'],
];

export function ConfigPanel({ activeSection, config, onChange }: ConfigPanelProps) {
  const iconInput = useRef<HTMLInputElement>(null);

  async function loadIcon(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange('iconDataUrl', String(reader.result));
    reader.readAsDataURL(file);
  }

  function setPermission(permission: string, enabled: boolean) {
    onChange('permissions', enabled
      ? [...new Set([...config.permissions, permission])]
      : config.permissions.filter((item) => item !== permission));
  }

  if (activeSection === 'icon') {
    return (
      <div className="panel-stack">
        <section className="form-card">
          <div className="section-title"><h2>应用图标</h2><p>默认使用拾一问图标，也可上传 PNG 或 WebP 替换。</p></div>
          <input ref={iconInput} className="sr-only" type="file" accept="image/png,image/webp" onChange={(event) => loadIcon(event.target.files?.[0])} />
          <button className="upload-zone" type="button" onClick={() => iconInput.current?.click()}>
            <span className="upload-zone__preview" style={{ background: config.iconBackground, borderRadius: `${config.iconRadius}%` }}>
              {config.iconDataUrl ? <img src={config.iconDataUrl} alt="应用图标预览" /> : <strong>问</strong>}
            </span>
            <strong>{config.iconDataUrl ? '更换应用图标' : '点击上传应用图标'}</strong>
            <span>推荐 PNG 或 WebP，尺寸不小于 512 × 512 px</span>
          </button>
          <div className="form-grid form-grid--two">
            <Field label="图标背景色"><input type="color" value={config.iconBackground} onChange={(e) => onChange('iconBackground', e.target.value)} /></Field>
            <Field label="圆角比例" count={`${config.iconRadius}%`}><input type="range" min="0" max="50" value={config.iconRadius} onChange={(e) => onChange('iconRadius', Number(e.target.value))} /></Field>
          </div>
        </section>
      </div>
    );
  }

  if (activeSection === 'splash') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>启动页与闪屏</h2><p>配置应用启动时的品牌展示。</p></div>
        <div className="form-grid form-grid--two">
          <Field label="启动页标题" count={`${config.splashTitle.length}/50`}><input maxLength={50} value={config.splashTitle} onChange={(e) => onChange('splashTitle', e.target.value)} /></Field>
          <Field label="启动页背景色"><input type="color" value={config.splashBackground} onChange={(e) => onChange('splashBackground', e.target.value)} /></Field>
        </div>
        <div className="splash-preview" style={{ background: config.splashBackground }}>
          <span style={{ background: config.iconBackground, borderRadius: `${config.iconRadius}%` }}>{config.iconDataUrl ? <img src={config.iconDataUrl} alt="" /> : <strong>问</strong>}</span>
          <strong>{config.splashTitle || config.appName}</strong>
          <i />
        </div>
      </section>
    );
  }

  if (activeSection === 'version') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>版本管理</h2><p>输出 Android APK；线上升级必须始终使用同一份正式签名。</p></div>
        <div className="form-grid form-grid--two">
          <Field label="版本名称" required hint="例如 1.0.0"><input value={config.versionName} onChange={(e) => onChange('versionName', e.target.value)} /></Field>
          <Field label="版本号" required hint="每次覆盖安装必须递增"><input type="number" min="1" value={config.versionCode} onChange={(e) => onChange('versionCode', Number(e.target.value))} /></Field>
          <Field label="最低支持"><select value={config.minSdk} onChange={(e) => onChange('minSdk', Number(e.target.value))}><option value="23">Android 6.0 (API 23)</option><option value="26">Android 8.0 (API 26)</option><option value="28">Android 9.0 (API 28)</option></select></Field>
          <Field label="目标 SDK"><select value={config.targetSdk} onChange={(e) => onChange('targetSdk', Number(e.target.value))}><option value="35">Android 15 (API 35)</option><option value="34">Android 14 (API 34)</option><option value="33">Android 13 (API 33)</option></select></Field>
          <Field label="屏幕方向"><select value={config.orientation} onChange={(e) => onChange('orientation', e.target.value as AppConfig['orientation'])}><option value="portrait">竖屏</option><option value="landscape">横屏</option><option value="unspecified">跟随设备</option></select></Field>
          <Field label="构建产物"><input value="Android APK" readOnly /></Field>
        </div>
      </section>
    );
  }

  if (activeSection === 'permissions') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>权限设置</h2><p>仅开启拾一问网页实际需要的设备权限。</p></div>
        <div className="toggle-list">
          {permissionOptions.map(([permission, label, description]) => (
            <Toggle key={permission} label={label} description={description} checked={config.permissions.includes(permission)} onChange={(value) => setPermission(permission, value)} />
          ))}
        </div>
      </section>
    );
  }

  if (activeSection === 'settings') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>其他设置</h2><p>线上版本应使用 HTTPS；HTTP 仅用于同一局域网内调试。</p></div>
        <div className="form-grid form-grid--two">
          <Field label="状态栏颜色"><input type="color" value={config.statusBarColor} onChange={(e) => onChange('statusBarColor', e.target.value)} /></Field>
          <Field label="HTTP 内容" hint="发布时必须关闭"><select value={config.allowHttp ? 'allow' : 'deny'} onChange={(e) => onChange('allowHttp', e.target.value === 'allow')}><option value="deny">仅允许 HTTPS</option><option value="allow">允许 HTTP（本地调试）</option></select></Field>
        </div>
        <div className="toggle-list">
          <Toggle label="全屏模式" description="隐藏系统状态栏，沉浸式显示页面" checked={config.fullscreen} onChange={(value) => onChange('fullscreen', value)} />
          <Toggle label="硬件加速" description="使用 GPU 提升动画和页面渲染性能" checked={config.hardwareAcceleration} onChange={(value) => onChange('hardwareAcceleration', value)} />
          <Toggle label="下拉刷新" description="保留网页下拉刷新配置" checked={config.pullToRefresh} onChange={(value) => onChange('pullToRefresh', value)} />
        </div>
      </section>
    );
  }

  if (activeSection === 'signing') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>打包签名</h2><p>测试签名适合自己手机安装；正式签名用于长期升级和未来发布。</p></div>
        <div className="form-grid">
          <Field label="签名模式" required><select value={config.signingMode} onChange={(e) => onChange('signingMode', e.target.value as AppConfig['signingMode'])}><option value="debug">测试签名（Debug，自动生成）</option><option value="release">正式签名（Release，使用你的 keystore）</option></select></Field>
          {config.signingMode === 'release' ? <div className="form-grid form-grid--two">
            <Field label="Keystore 路径" required hint="构建服务可访问的绝对路径"><input placeholder="D:\\keys\\pickoneq-release.jks" value={config.keystorePath} onChange={(e) => onChange('keystorePath', e.target.value)} /></Field>
            <Field label="Key Alias" required><input placeholder="pickoneq" value={config.keyAlias} onChange={(e) => onChange('keyAlias', e.target.value)} /></Field>
            <Field label="Store Password" required><input type="password" autoComplete="new-password" value={config.storePassword} onChange={(e) => onChange('storePassword', e.target.value)} /></Field>
            <Field label="Key Password" required><input type="password" autoComplete="new-password" value={config.keyPassword} onChange={(e) => onChange('keyPassword', e.target.value)} /></Field>
          </div> : <div className="security-note"><Icon name="shield" size={18} /><span>无需填写 keystore。Gradle 会使用本机默认 Debug 证书自动签名；以后切换为 Release 时需先卸载 Debug 版。</span></div>}
        </div>
        {config.signingMode === 'release' ? <div className="security-note"><Icon name="shield" size={18} /><span>密码仅传给本地 Gradle 进程，不会写入导出的配置、构建日志或生成的 Android 工程。</span></div> : null}
      </section>
    );
  }

  if (activeSection === 'build') {
    return (
      <section className="form-card">
        <div className="section-title"><h2>打包与发布</h2><p>将已经部署的拾一问 HTTPS 服务封装为 Android 应用。</p></div>
        <div className="summary-table">
          <span>应用名称</span><strong>{config.appName}</strong>
          <span>内容来源</span><strong>远程拾一问服务</strong>
          <span>应用包名</span><strong>{config.packageName}</strong>
          <span>构建版本</span><strong>{config.versionName} ({config.versionCode})</strong>
          <span>输出格式</span><strong>{config.signingMode === 'release' ? 'Release APK' : 'Debug APK'}</strong>
          <span>签名方式</span><strong>{config.signingMode === 'release' ? (config.keystorePath ? 'Release 签名已配置' : '待配置 Release 签名') : '测试签名（自动）'}</strong>
        </div>
      </section>
    );
  }

  return (
    <div className="panel-stack">
      <section className="form-card">
        <div className="section-title"><h2>应用基本信息</h2><p>拾一问依赖本地 Node 服务调用模型，APK 连接你已经部署的 Web 服务。</p></div>
        <div className="form-grid">
          <Field label="应用名称" required count={`${config.appName.length}/50`}><input maxLength={50} value={config.appName} onChange={(e) => onChange('appName', e.target.value)} /></Field>
          <Field label="内容来源"><input value="远程拾一问 Web 服务" readOnly /></Field>
          <Field label="WebApp 地址" required hint="发布使用 HTTPS；手机调试可使用局域网 HTTP 地址"><input type="url" placeholder="https://pickoneq.example.com" value={config.webUrl} onChange={(e) => onChange('webUrl', e.target.value)} /></Field>
          <div className="security-note"><Icon name="globe" size={18} /><span>GitHub Release 用于分发 APK 与升级清单，不会替你托管拾一问 Node 服务。</span></div>
          <Field label="应用包名" required hint="包名是应用的唯一标识" count={`${config.packageName.length}/100`}><input maxLength={100} value={config.packageName} onChange={(e) => onChange('packageName', e.target.value)} /></Field>
          <div className="form-grid form-grid--two">
            <Field label="版本名称" required count={`${config.versionName.length}/20`}><input maxLength={20} value={config.versionName} onChange={(e) => onChange('versionName', e.target.value)} /></Field>
            <Field label="版本号" required hint="每次升级必须递增"><input type="number" min="1" value={config.versionCode} onChange={(e) => onChange('versionCode', Number(e.target.value))} /></Field>
          </div>
          <Field label="应用描述" count={`${config.description.length}/200`}><textarea maxLength={200} rows={3} value={config.description} onChange={(e) => onChange('description', e.target.value)} /></Field>
          <Field label="开发者名称" count={`${config.developerName.length}/50`}><input maxLength={50} value={config.developerName} onChange={(e) => onChange('developerName', e.target.value)} /></Field>
          <Field label="开发者邮箱" count={`${config.developerEmail.length}/100`}><input type="email" maxLength={100} value={config.developerEmail} onChange={(e) => onChange('developerEmail', e.target.value)} /></Field>
          <Field label="官网地址" count={`${config.website.length}/100`}><input type="url" maxLength={100} value={config.website} onChange={(e) => onChange('website', e.target.value)} /></Field>
        </div>
      </section>
      <section className="form-card">
        <div className="section-title"><h2>应用分类与标签</h2></div>
        <div className="form-grid">
          <Field label="应用分类"><select value={config.category} onChange={(e) => onChange('category', e.target.value)}><option>教育</option><option>工具</option><option>商务</option><option>生活</option><option>娱乐</option></select></Field>
          <Field label="关键词（用逗号分隔）" hint="最多输入 10 个关键词" count={`${config.keywords.length}/100`}><input maxLength={100} value={config.keywords} onChange={(e) => onChange('keywords', e.target.value)} /></Field>
        </div>
      </section>
    </div>
  );
}
