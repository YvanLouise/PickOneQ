import type { ReactNode } from 'react';

export type IconName =
  | 'android' | 'info' | 'image' | 'splash' | 'package' | 'shield' | 'settings' | 'key' | 'box'
  | 'help' | 'external' | 'import' | 'export' | 'sun' | 'moon' | 'chevron' | 'bolt' | 'globe'
  | 'check' | 'upload' | 'download' | 'terminal' | 'refresh' | 'alert' | 'close' | 'smartphone' | 'developer';

type IconProps = { name: IconName; size?: number };

export function Icon({ name, size = 20 }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };
  const paths: Record<IconName, ReactNode> = {
    android: <><path d="M7 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="m8 8-1.6-2.5M16 8l1.6-2.5M8 13v3M16 13v3M9 4.5h6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    image: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 16 3.5-3.5 2.7 2.6 2-2.3L19 16"/><circle cx="9" cy="9" r="1.2"/></>,
    splash: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 15.5 12 9l3 6.5-3-1.2-3 1.2Z"/></>,
    package: <><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 8v8l8 4 8-4V8M12 12v8"/></>,
    shield: <path d="M12 3 5 6v5c0 4.4 2.7 8 7 10 4.3-2 7-5.6 7-10V6l-7-3Z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.6-1.5.9-1.9-2.1-2.1-1.9.9-1.5-.6L10.5 3h-3l-.7 2-.1.1M5.1 6.7l-.8.8.9 1.9-.6 1.5-2 .7v3l2 .7.6 1.5-.9 1.9 2.1 2.1 1.9-.9 1.5.6.7 2h3l.7-2 1.5-.6 1.9.9 2.1-2.1-.9-1.9.6-1.5 2-.7"/></>,
    key: <><circle cx="9" cy="15" r="4"/><path d="m12 12 7-7M16 8l2 2M14 10l2 2"/></>,
    box: <><path d="m5 7 7-4 7 4v10l-7 4-7-4V7Z"/><path d="m5 7 7 4 7-4M12 11v10"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.2 2.3c-.9.4-.9 1-.9 1.7M12 17h.01"/></>,
    external: <><path d="M14 5h5v5M13 11l6-6"/><path d="M17 13v5H6V7h5"/></>,
    import: <><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 18v2h14v-2"/></>,
    export: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 18v2h14v-2"/></>,
    sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    bolt: <path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z"/>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.4 5.5 3.4 9S14.3 18.5 12 21M12 3c-2.3 2.5-3.4 5.5-3.4 9S9.7 18.5 12 21"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    upload: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 20h14"/></>,
    download: <><path d="M12 3v13M8 12l4 4 4-4"/><path d="M5 20h14"/></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M18.3 17a8 8 0 1 1 1.3-7"/></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    smartphone: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/></>,
    developer: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 9-2 3 2 3M15 9l2 3-2 3M13 8l-2 8"/></>,
  };
  return <svg {...common} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
