import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/app/auth-store';
import { PlaneTakeoff, ShieldAlert } from 'lucide-react';

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-4 sm:p-8">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-surface-container p-8 shadow-elevated-lg border border-outline-variant text-on-surface transition-all">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <PlaneTakeoff className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 text-headline-md tracking-tight">
            Travel Journal
          </h1>
          <p className="mb-8 text-sm font-medium text-on-surface-variant">
            Your personal travel companion. Please sign in to securely access your vault.
          </p>

          <div
            className="flex flex-col items-center justify-center min-h-[50px] w-full mb-2 max-w-[280px]"
            ref={buttonContainerRef}
          >
            {/* GIS Button will render here */}
            {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <div className="text-sm text-error p-3 font-semibold">
                System not configured: Missing Google Client ID.
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 flex items-start space-x-3 rounded-2xl bg-error-container p-4 border border-error/20 text-left w-full shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ShieldAlert className="h-5 w-5 text-on-error-container shrink-0 mt-0.5" />
              <p className="text-sm text-on-error-container font-medium">{error}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-8 text-on-surface-variant/50 text-xs font-medium tracking-wide uppercase">
        Secure Access Only
      </div>
    </div>
  );
}
