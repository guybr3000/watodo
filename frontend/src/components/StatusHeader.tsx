import React from 'react';
import { StatusData } from '../types';
import { QrCodeIcon, FolderArchiveIcon, SettingsIcon, SunIcon, MoonIcon, RefreshIcon } from './Icons';

interface Props {
  status: StatusData | null;
  theme: 'dark' | 'light';
  reconnecting: boolean;
  onToggleTheme: () => void;
  onOpenQr: () => void;
  onReconnect: () => void;
  onRepair: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
}

export const StatusHeader: React.FC<Props> = ({
  status,
  theme,
  reconnecting,
  onToggleTheme,
  onOpenQr,
  onReconnect,
  onRepair,
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

  // A dropped or logged-out listener needs a way back that does not involve restarting
  // the server, and 'connecting' is included so a stalled handshake can be forced too.
  const showReconnect = waStatus === 'disconnected' || waStatus === 'connecting';
  const disconnectReason = status?.whatsapp.lastDisconnectReason;

  return (
    <header className="header">
      <div className="logo-area">
        <img src={theme === 'light' ? '/logo-light.png' : '/logo.png'} alt="Watodo Logo" className="logo-img" />
        <h1 className="brand-title">Watodo</h1>
      </div>

      <div className="header-status">
        <div
          className="status-badge"
          title={waStatus !== 'connected' && disconnectReason ? disconnectReason : statusLabel}
        >
          <span className={`status-dot ${waStatus}`} />
          <span>{statusLabel}</span>
        </div>

        {waStatus === 'qr_ready' && (
          <button className="btn btn-primary" onClick={onOpenQr}>
            <QrCodeIcon size={16} />
            <span>Pair WhatsApp</span>
          </button>
        )}

        {showReconnect && (
          <>
            <button
              className="btn btn-primary"
              onClick={onReconnect}
              disabled={reconnecting}
              title="Restart the WhatsApp listener using the saved session"
            >
              <RefreshIcon size={16} />
              <span>{reconnecting ? 'Reconnecting...' : 'Reconnect'}</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={onRepair}
              disabled={reconnecting}
              title="Clear the saved WhatsApp session and pair again with a new QR code"
            >
              <QrCodeIcon size={16} />
              <span>New QR</span>
            </button>
          </>
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
