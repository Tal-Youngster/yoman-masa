import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  email: string;
  name: string;
  picture?: string | undefined;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  error: string | null;
  login: (credential: string) => void;
  logout: () => void;
  clearError: () => void;
}

interface JwtPayload {
  email?: string | undefined;
  name?: string | undefined;
  picture?: string | undefined;
  [key: string]: unknown;
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      if (pad === 1) return null;
      base64 += new Array(5 - pad).join('=');
    }
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT', e);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      error: null,
      login: (credential: string) => {
        const payload = parseJwt(credential);
        if (!payload || !payload.email) {
          set({ error: 'Invalid Google login response.', isAuthenticated: false, user: null });
          return;
        }

        set({
          user: {
            email: payload.email,
            name: payload.name || 'User',
            picture: payload.picture,
          },
          isAuthenticated: true,
          error: null,
        });
      },
      logout: () => set({ user: null, isAuthenticated: false, error: null }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'yoman-masa-auth', // unique name for localStorage key
    }
  )
);
