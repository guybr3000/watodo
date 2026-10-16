import React, { useState, useEffect } from 'react';
import { StatusHeader } from './components/StatusHeader';
import { LiveFeed } from './components/LiveFeed';
import { KbBrowser } from './components/KbBrowser';
import { QrModal } from './components/QrModal';
import { ImporterModal } from './components/ImporterModal';
import { SettingsModal } from './components/SettingsModal';
import { SplashScreen } from './components/SplashScreen';
import { StatusData, LogEvent, KbItemSummary } from './types';
import { InboxIcon, ActivityIcon } from './components/Icons';

export const App: React.FC = () => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [kbItems, setKbItems] = useState<KbItemSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'kb' | 'feed'>('kb');

  // Dark & Light Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('watodo_theme') as 'dark' | 'light') || 'dark';
  });

  const [reconnecting, setReconnecting] = useState(false);

  const [showQrModal, setShowQrModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('watodo_theme', theme);

    // Dynamically update favicon based on light/dark mode
    const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (favicon) {
      favicon.href = theme === 'light' ? '/logo-light.png' : '/logo.png';
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {}
  };

  const fetchKbItems = async () => {
    try {
      const res = await fetch('/api/kb');
      if (res.ok) {
        const data = await res.json();
        setKbItems(data);
      }
    } catch {}
  };

  // Restart the WhatsApp listener. `reset` clears the stored session, which is the way
  // back when the phone has unlinked this device and the saved credentials are dead.
  const requestReconnect = async (reset: boolean) => {
    if (reconnecting) return;
    if (
      reset &&
      !window.confirm(
        'Clear the saved WhatsApp session? You will need to scan a new QR code to link this device again.'
      )
    ) {
      return;
    }

    setReconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset })
      });
      if (res.ok && reset) {
        // A reset always ends in a pairing QR code, so show it as soon as it arrives.
        setShowQrModal(true);
      }
    } catch {
    } finally {
      setReconnecting(false);
      fetchStatus();
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchKbItems();

    const timer = setInterval(fetchStatus, 5000);

    // Connect to Server-Sent Events stream
    const eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'history') {
          setEvents(data.events || []);
        } else if (data.type === 'event') {
          setEvents(prev => [...prev, data.event]);
          if (data.event.stage === 'storage') {
            fetchKbItems();
            fetchStatus();
          } else if (
            data.event.details?.qrDataUrl ||
            (data.event.stage === 'listener' && data.event.type !== 'info')
          ) {
            fetchStatus();
          }
        }
      } catch {}
    };

    return () => {
      clearInterval(timer);
      eventSource.close();
    };
  }, []);

  const unreadCount = kbItems.filter(i => i.status !== 'done').length;
  const doneCount = kbItems.filter(i => i.status === 'done').length;

  return (
    <>
      <SplashScreen minDurationMs={1100} theme={theme} />

      <StatusHeader
        status={status}
        theme={theme}
        reconnecting={reconnecting}
        onToggleTheme={toggleTheme}
        onOpenQr={() => setShowQrModal(true)}
        onReconnect={() => requestReconnect(false)}
        onRepair={() => requestReconnect(true)}
        onOpenImport={() => setShowImportModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <div className="main-container">
        <aside className="sidebar">
          <button
            className={`nav-item ${activeTab === 'kb' ? 'active' : ''}`}
            onClick={() => setActiveTab('kb')}
          >
            <span className="nav-item-content">
              <InboxIcon size={18} />
              <span>{status?.config.targetChatName ? `${status.config.targetChatName} Inbox` : 'To Do Inbox'}</span>
            </span>
            <span className="badge-count" style={{ fontSize: '0.75rem' }}>{kbItems.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            <span className="nav-item-content">
              <ActivityIcon size={18} />
              <span>Processing Stream</span>
            </span>
            {events.length > 0 && (
              <span className="filter-badge" style={{ fontSize: '0.7rem' }}>{events.length}</span>
            )}
          </button>

          <div className="stats-card">
            <div className="stats-title">
              {status?.config.targetChatName ? `${status.config.targetChatName} Inbox` : 'To Do Inbox'}
            </div>
            <div className="stats-value">{kbItems.length}</div>
            <div className="stats-pills">
              <span style={{ color: '#d97706' }}>📥 {unreadCount} Pending</span>
              <span style={{ color: 'var(--text-dim)' }}>•</span>
              <span style={{ color: '#16a34a' }}>✅ {doneCount} Done</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.65rem', borderTop: '1px solid var(--bg-card-border)', paddingTop: '0.5rem' }}>
              Tracked Chat: <strong style={{ color: 'var(--text-main)' }}>"{status?.config.targetChatName || 'To Do'}"</strong>
            </div>
          </div>
        </aside>

        <main className="content-area">
          {activeTab === 'kb' && (
            <KbBrowser
              items={kbItems}
              onRefresh={fetchKbItems}
              inboxTitle={status?.config.targetChatName ? `${status.config.targetChatName} Inbox` : 'To Do Inbox'}
            />
          )}

          {activeTab === 'feed' && (
            <LiveFeed events={events} />
          )}
        </main>
      </div>

      {showQrModal && (
        <QrModal
          qrDataUrl={status?.whatsapp.qrDataUrl || null}
          targetChatName={status?.config.targetChatName || 'To Do'}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {showImportModal && (
        <ImporterModal
          onClose={() => setShowImportModal(false)}
          onImportStarted={() => {
            setActiveTab('feed');
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          status={status}
          onClose={() => setShowSettingsModal(false)}
          onSave={fetchStatus}
        />
      )}
    </>
  );
};
