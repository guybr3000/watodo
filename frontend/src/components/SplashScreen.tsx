import React, { useEffect, useState } from 'react';

interface Props {
  onFinish?: () => void;
  minDurationMs?: number;
  theme?: 'dark' | 'light';
}

export const SplashScreen: React.FC<Props> = ({ onFinish, minDurationMs = 1200, theme }) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const activeTheme = theme || (typeof window !== 'undefined' ? (localStorage.getItem('watodo_theme') as 'dark' | 'light') || 'dark' : 'dark');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      const hideTimer = setTimeout(() => {
        setHidden(true);
        if (onFinish) onFinish();
      }, 500);
      return () => clearTimeout(hideTimer);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs, onFinish]);

  if (hidden) return null;

  return (
    <div className={`splash-screen-overlay ${fading ? 'fade-out' : ''}`}>
      <div className="splash-card">
        <div className="splash-logo-container">
          <img
            src={activeTheme === 'light' ? '/logo-light.png' : '/logo.png'}
            alt="Watodo"
            className="splash-logo"
          />
          <div className="splash-glow" />
        </div>
        <h1 className="splash-title">Watodo</h1>
        <p className="splash-subtitle">Intelligent WhatsApp Task & Note Inbox</p>
        <div className="splash-loader-bar">
          <div className="splash-loader-progress" />
        </div>
      </div>
    </div>
  );
};
