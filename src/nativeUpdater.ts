type NativeUpdater = {
  checkForUpdate: () => void;
  getVersionName?: () => string;
};

declare global {
  interface Window {
    PickOneQUpdater?: NativeUpdater;
  }
}

export function hasNativeUpdater() {
  return typeof window !== 'undefined' && typeof window.PickOneQUpdater?.checkForUpdate === 'function';
}

export function nativeVersionName() {
  if (!hasNativeUpdater()) return '';
  try {
    return window.PickOneQUpdater?.getVersionName?.().trim() || '';
  } catch {
    return '';
  }
}

export function checkNativeUpdate() {
  window.PickOneQUpdater?.checkForUpdate();
}
