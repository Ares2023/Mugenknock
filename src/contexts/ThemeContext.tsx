'use client';
import React, { createContext, useContext, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { API_ENDPOINT } from '../constants';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

export type CustomColors = Record<string, string>;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  customColors: CustomColors;
  customColorsEnabled: boolean;
  applyColors: (colors: CustomColors) => void;
  setCustomColorsEnabled: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  customColors: {},
  customColorsEnabled: true,
  applyColors: () => {},
  setCustomColorsEnabled: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const CACHE_KEY = 'customColors_v2';
const CACHE_TTL = 5 * 60 * 1000;

function applyToRoot(colors: CustomColors) {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, val]) => root.style.setProperty(key, val));
}

function clearFromRoot(colors: CustomColors) {
  const root = document.documentElement;
  Object.keys(colors).forEach(key => root.style.removeProperty(key));
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const uid = user?.userId;

  const [theme, setTheme] = useState<Theme>('light');
  const [customColors, setCustomColors] = useState<CustomColors>({});
  const [customColorsEnabled, setCustomColorsEnabledState] = useState<boolean>(true);

  // クライアントサイドでlocalStorageから初期値を復元
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') setTheme(saved as Theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { colors, enabled, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          if (colors) setCustomColors(colors);
          if (typeof enabled === 'boolean') setCustomColorsEnabledState(enabled);
        }
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // uidが確定・変更したらアカウント別設定を適用
  useEffect(() => {
    if (!uid) return;
    const saved = localStorage.getItem(`theme_${uid}`);
    if (saved === 'dark' || saved === 'light') setTheme(saved as Theme);
  }, [uid]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark' || !customColorsEnabled) {
      clearFromRoot(customColors);
    } else {
      if (Object.keys(customColors).length > 0) applyToRoot(customColors);
    }
  }, [theme, customColors, customColorsEnabled]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/settings/theme`)
      .then(r => r.json())
      .then(data => {
        const colors: CustomColors = data.colors ?? {};
        const enabled: boolean = data.enabled !== false; // default true
        setCustomColors(colors);
        setCustomColorsEnabledState(enabled);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ colors, enabled, ts: Date.now() }));
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (uid) {
        localStorage.setItem(`theme_${uid}`, next);
      } else {
        localStorage.setItem('theme', next);
      }
      return next;
    });
  };

  const applyColors = useCallback((colors: CustomColors) => {
    setCustomColors(colors);
    if (theme !== 'dark' && customColorsEnabled) applyToRoot(colors);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ colors, enabled: customColorsEnabled, ts: Date.now() }));
  }, [theme, customColorsEnabled]);

  const setCustomColorsEnabled = useCallback((enabled: boolean) => {
    setCustomColorsEnabledState(enabled);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ colors: customColors, enabled, ts: Date.now() }));
  }, [customColors]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, customColors, customColorsEnabled, applyColors, setCustomColorsEnabled }}>
      {children}
    </ThemeContext.Provider>
  );
};
