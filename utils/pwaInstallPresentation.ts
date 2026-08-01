import type { PwaRuntimeSnapshot } from './pwaRuntime';

export type PwaInstallRowPresentation = {
  key: 'update' | 'ios-manual' | 'prompt';
  title: string;
  description: string;
  action?: 'install' | 'update';
  actionLabel?: string;
  badge?: string;
};

/**
 * Settings only owns actions that are useful right now. Installation success
 * and standalone launch are states, not permanent settings, so they disappear
 * unless a newer release needs an explicit reload.
 */
export const resolvePwaInstallRowPresentation = (
  snapshot: PwaRuntimeSnapshot,
): PwaInstallRowPresentation | null => {
  if (snapshot.isCapacitor) return null;

  if (snapshot.updateAvailable) {
    return {
      key: 'update',
      title: '新版本可用',
      description: '重新打开即可使用最新版',
      action: 'update',
      actionLabel: '现在更新',
    };
  }

  if (snapshot.standalone || snapshot.installedThisSession) return null;

  if (snapshot.platform === 'ios') {
    return {
      key: 'ios-manual',
      title: '添加到手机桌面',
      description: '点浏览器的分享按钮，再选「添加到主屏幕」',
      badge: '手动添加',
    };
  }

  if (snapshot.installPromptAvailable) {
    return {
      key: 'prompt',
      title: '添加到手机桌面',
      description: '以后可以像 App 一样直接打开',
      action: 'install',
      actionLabel: '添加',
    };
  }

  return null;
};
