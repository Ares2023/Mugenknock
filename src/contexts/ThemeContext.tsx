import React, { createContext, useContext, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { API_ENDPOINT } from '../constants';

type Theme = 'light' | 'dark';

export type CustomColors = Record<string, string>;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  customColors: CustomColors;
  applyColors: (colors: CustomColors) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  customColors: {},
  applyColors: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const CACHE_KEY = 'customColors_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function applyToRoot(colors: CustomColors) {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [customColors, setCustomColors] = useState<CustomColors>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { colors, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return colors;
      }
    } catch {}
    return {};
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useLayoutEffect(() => {
    if (Object.keys(customColors).length > 0) applyToRoot(customColors);
  }, [customColors]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/settings/theme`)
      .then(r => r.json())
      .then(data => {
        const colors: CustomColors = data.colors ?? {};
        if (Object.keys(colors).length === 0) return;
        setCustomColors(colors);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ colors, ts: Date.now() }));
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  const applyColors = useCallback((colors: CustomColors) => {
    setCustomColors(colors);
    applyToRoot(colors);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ colors, ts: Date.now() }));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, customColors, applyColors }}>
      {children}
    </ThemeContext.Provider>
  );
};
