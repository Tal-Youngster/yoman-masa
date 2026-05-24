import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// `beforeinstallprompt` isn't in the DOM lib types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

function isStandalone(): boolean {
  return (
    // matchMedia is absent in some test/SSR environments.
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Captures the browser's install prompt and surfaces a dismissable banner.
 * Renders nothing until the browser signals the app is installable, and never
 * again once installed or dismissed.
 */
export function InstallBanner(): React.JSX.Element | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(
    () => isStandalone() || localStorage.getItem(DISMISSED_KEY) === '1',
  );

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault(); // stop Chrome's default mini-infobar; we show our own
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setHidden(true);
      setDeferred(null);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !deferred) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setHidden(true);
  };

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    // Whatever the choice, the event can't be reused — drop it.
    setDeferred(null);
  };

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-outline-variant bg-surface px-4 py-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Download className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface">Install Travel Journal</p>
          <p className="text-xs text-on-surface-variant">Add to your home screen for offline use.</p>
        </div>
        <button
          onClick={() => void install()}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-on-surface/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
