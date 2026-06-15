'use client';
import React, { createContext, useContext } from 'react';
import { ja } from '../i18n/translations';

// 英語対応を廃止し、日本語固定
export type Lang = 'ja';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ja',
  setLang: () => {},
  t: (key) => key,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const t = (key: string, vars?: Record<string, string | number>): string => {
    let str = ja[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang: 'ja', setLang: () => {}, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
