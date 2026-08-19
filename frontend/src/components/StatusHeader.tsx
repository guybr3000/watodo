import React from 'react';
import { StatusData } from '../types';
import { QrCodeIcon, FolderArchiveIcon, SettingsIcon, SunIcon, MoonIcon } from './Icons';

interface Props {
  status: StatusData | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenQr: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
}

export const StatusHeader: React.FC<Props> = ({
  status,
  theme,
  onToggleTheme,
  onOpenQr,
  onOpenImport,
  onOpenSettings
}) => {
  const waStatus = status?.whatsapp.status || 'disconnected';
  const statusLabel =
    waStatus === 'connected'
      ? 'WhatsApp Connected'
      : waStatus === 'qr_ready'
      ? 'QR Code Ready'
      : waStatus === 'connecting'
      ? 'Connecting...'
      : 'Disconnected';

  return (
    <header className="header">
      <div className="logo-area">
        <img src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="Watodo Logo" className="logo-img" />
        <h1 className="brand-title">Watodo</h1>
      </div>

      <div className="header-status">
        <div className="status-badge">
          <span className={`status-dot ${waStatus}`} />
          <span>{statusLabel}</span>
        </div>

        {waStatus === 'qr_ready' && (
          <button className="btn btn-primary" onClick={onOpenQr}>
            <QrCodeIcon size={16} />
            <span>Pair WhatsApp</span>
          </button>
        )}

        <button className="btn btn-secondary" onClick={onOpenImport} title="Import exported WhatsApp chat ZIP">
          <FolderArchiveIcon size={16} />
          <span>Import ZIP</span>
        </button>

        <button className="btn btn-secondary" onClick={onOpenSettings} title="Settings">
          <SettingsIcon size={16} />
          <span>Settings</span>
        </button>

        <button
          className="btn-icon"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </button>
      </div>
    </header>
  );
};
