export type SectionKey =
  | 'info'
  | 'icon'
  | 'splash'
  | 'version'
  | 'permissions'
  | 'settings'
  | 'signing'
  | 'build';

export type AppConfig = {
  appName: string;
  packageName: string;
  sourceMode: 'remote';
  webUrl: string;
  versionName: string;
  versionCode: number;
  description: string;
  developerName: string;
  developerEmail: string;
  website: string;
  category: string;
  keywords: string;
  iconDataUrl: string;
  iconBackground: string;
  iconRadius: number;
  splashTitle: string;
  splashBackground: string;
  minSdk: number;
  targetSdk: number;
  orientation: 'portrait' | 'landscape' | 'unspecified';
  outputType: 'apk';
  signingMode: 'debug' | 'release';
  statusBarColor: string;
  fullscreen: boolean;
  hardwareAcceleration: boolean;
  pullToRefresh: boolean;
  allowHttp: boolean;
  updateManifestUrl: string;
  autoPublish: boolean;
  githubRepository: string;
  githubBranch: string;
  releaseNotes: string;
  permissions: string[];
  keystorePath: string;
  keyAlias: string;
  storePassword: string;
  keyPassword: string;
};

export type BuildPhase = 'idle' | 'validating' | 'building' | 'success' | 'error';

export type BuildState = {
  phase: BuildPhase;
  progress: number;
  message: string;
  logs: string[];
  operation?: 'build' | 'publish';
  artifactUrl?: string;
  projectPath?: string;
  publication?: {
    tag: string;
    apkUrl: string;
    manifestUrl: string;
    sha256: string;
  };
};

export type EnvironmentState = {
  loading: boolean;
  ready: boolean;
  java: boolean;
  gradle: boolean;
  androidSdk: boolean;
  buildTools: boolean;
  githubPublisherConfigured: boolean;
  githubPublisherSource: 'provided' | 'environment' | 'git-credential-manager' | 'missing';
  defaultWebUrl?: string;
  releaseSuggestion?: {
    packageName: string;
    currentVersionName: string;
    currentVersionCode: number;
    nextVersionName: string;
    nextVersionCode: number;
  };
  message: string;
};
