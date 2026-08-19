import React from 'react';
import { XIcon, QrCodeIcon } from './Icons';

interface Props {
  qrDataUrl: string | null;
  targetChatName: string;
  onClose: () => void;
}

export const QrModal: React.FC<Props> = ({ qrDataUrl, targetChatName, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <QrCodeIcon size={20} style={{ color: 'var(--accent-wa)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Connect WhatsApp</h2>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <XIcon size={16} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
          Open WhatsApp on your mobile device, navigate to <strong>Settings &gt; Linked Devices &gt; Link a Device</strong>, and scan the QR code below:
        </p>

        {qrDataUrl ? (
          <div className="qr-box">
            <img src={qrDataUrl} alt="WhatsApp QR Code" />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Generating WhatsApp pairing QR code...
          </div>
        )}

        <div style={{
          background: 'rgba(37, 211, 102, 0.08)',
          border: '1px solid rgba(37, 211, 102, 0.25)',
          borderRadius: '10px',
          padding: '0.85rem 1rem',
          fontSize: '0.85rem',
          color: 'var(--accent-wa)'
        }}>
          Watodo strictly monitors and ingests messages only from your designated chat: <strong>"{targetChatName}"</strong>.
        </div>
      </div>
    </div>
  );
};
