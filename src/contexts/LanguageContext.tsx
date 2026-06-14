'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ja, en } from '../i18n/translations';
import { useAuth } from './AuthContext';

export type Lang = 'ja' | 'en';

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
  const { user } = useAuth();
  const uid = user?.userId;

  const [lang, setLangState] = useState<Lang>('ja');

  useEffect(() => {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'ja') setLangState(saved as Lang);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // uidが確定・変更したらアカウント別設定を適用
  useEffect(() => {
    if (!uid) return;
    const saved = localStorage.getItem(`lang_${uid}`);
    if (saved === 'en' || saved === 'ja') setLangState(saved as Lang);
  }, [uid]);

  const setLang = (l: Lang) => {
    if (uid) {
      localStorage.setItem(`lang_${uid}`, l);
    } else {
      localStorage.setItem('lang', l);
    }
    setLangState(l);
  };

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const dict = lang === 'en' ? en : ja;
    let str = dict[key] ?? ja[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
