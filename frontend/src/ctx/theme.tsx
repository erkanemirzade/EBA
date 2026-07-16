import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '@/src/utils/storage';
import { colors } from '../theme';

type Mode = 'system' | 'light' | 'dark';

type ThemeCtx = {
  mode: Mode;
  isDark: boolean;
  c: typeof colors.light;
  setMode: (m: Mode) => void;
};

const Ctx = createContext<ThemeCtx | undefined>(undefined);

const KEY = 'eba_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');

  useEffect(() => {
    (async () => {
      const v = await storage.getItem<string>(KEY, 'system');
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    })();
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    storage.setItem(KEY, m);
  };

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const isDark = resolved === 'dark';
  const c = colors[resolved];

  return <Ctx.Provider value={{ mode, isDark, c, setMode }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used within ThemeProvider');
  return c;
}
