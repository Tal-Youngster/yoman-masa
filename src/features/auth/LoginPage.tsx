import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/app/auth-store';
import { PlaneTakeoff, ShieldAlert, MapPinned, BedDouble, Wallet } from 'lucide-react';

export function LoginPage(): React.JSX.Element {
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: '/' });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Missing VITE_GOOGLE_CLIENT_ID');
      return;
    }

    const initGis = () => {
      if (window.google?.accounts?.id && buttonContainerRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => {
            login(response.credential);
          },
        });
        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGis();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGis;
      document.body.appendChild(script);
    }
  }, [login]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-surface to-surface-container-low p-4 sm:p-8">
      {/* Soft ambient glow behind the card. */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" aria-hidden />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-outline-variant bg-surface-container/90 p-8 text-on-surface shadow-elevated-lg backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 shadow-soft">
            <PlaneTakeoff className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 text-headline-md tracking-tight">Travel Journal</h1>
          <p className="mb-6 text-sm font-medium text-on-surface-variant">
            Your offline-first companion for the whole journey — plan it, map it, and keep every
            booking in your own vault.
          </p>

          <ul className="mb-8 grid w-full grid-cols-3 gap-2 text-on-surface-variant">
            <Highlight icon={<MapPinned className="h-5 w-5" />} label="Map your trip" />
            <Highlight icon={<BedDouble className="h-5 w-5" />} label="Track stays" />
            <Highlight icon={<Wallet className="h-5 w-5" />} label="Watch spend" />
          </ul>

          <div
            className="mb-2 flex min-h-[50px] w-full max-w-[280px] flex-col items-center justify-center"
            ref={buttonContainerRef}
          >
            {/* GIS Button will render here */}
            {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <div className="p-3 text-sm font-semibold text-error">
                System not configured: Missing Google Client ID.
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 flex w-full items-start space-x-3 rounded-2xl border border-error/20 bg-error-container p-4 text-left shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-on-error-container" />
              <p className="text-sm font-medium text-on-error-container">{error}</p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 text-xs font-medium uppercase tracking-wide text-on-surface-variant/50">
        Secure Access Only
      </div>
    </div>
  );
}

function Highlight({ icon, label }: { icon: React.ReactNode; label: string }): React.JSX.Element {
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-container-low/70 px-2 py-3">
      <span className="text-primary">{icon}</span>
      <span className="text-[11px] font-medium leading-tight text-on-surface-variant">{label}</span>
    </li>
  );
}
