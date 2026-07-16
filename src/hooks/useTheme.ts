import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * Gère le thème clair/sombre de la plateforme.
 * - Par défaut : clair (aucune préférence enregistrée).
 * - Applique la classe `.dark` sur <html> (stratégie Tailwind darkMode: 'class').
 * - Persiste le choix dans localStorage.
 */
export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
};
