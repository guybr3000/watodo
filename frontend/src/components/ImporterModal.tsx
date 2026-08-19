import React, { useState } from 'react';
import { FolderArchiveIcon, XIcon, CheckCircleIcon } from './Icons';

interface Props {
  onClose: () => void;
  onImportStarted: () => void;
}

export const ImporterModal: React.FC<Props> = ({ onClose, onImportStarted }) => {
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const startImport = async () => {
    setImporting(true);
    setMsg('Starting archive import...');
    try {
      const res = await fetch('/api/import-zip', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg('Import initiated! Switch to Processing Stream to watch live progress.');
        onImportStarted();
        setTimeout(onClose, 2500);
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMsg(`Network error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderArchiveIcon size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Historical Archive Importer</h2>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <XIcon size={16} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
          Watodo will parse your exported chat file <code>WhatsApp Chat with To Do.txt</code> (or <code>WhatsApp Chat with To Do.zip</code>), process all GitHub repositories, articles, and notes through the AI enrichment pipeline, and index your Inbox.
        </p>

        {msg && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            color: 'var(--accent-primary)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircleIcon size={16} />
            <span>{msg}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={startImport} disabled={importing}>
            {importing ? 'Processing Archive...' : 'Start Ingestion Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
