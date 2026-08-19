import React, { useRef, useEffect } from 'react';
import { LogEvent } from '../types';
import { ActivityIcon } from './Icons';

interface Props {
  events: LogEvent[];
}

export const LiveFeed: React.FC<Props> = ({ events }) => {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="glass-card">
      <div className="card-title">
        <ActivityIcon size={20} style={{ color: 'var(--accent-primary)' }} />
        <span>Real-Time Processing Stream</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginLeft: 'auto', fontWeight: 'normal' }}>
          {events.length} events logged
        </span>
      </div>

      <div className="log-terminal" ref={terminalRef}>
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '1rem' }}>
            Awaiting incoming WhatsApp events... Post a repository link or note in your "To Do" chat to start ingestion.
          </div>
        ) : (
          events.map((evt) => (
            <div key={evt.id} className="log-line">
              <span className="log-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
              <span className={`log-stage stage-${evt.stage}`}>{evt.stage}</span>
              <span style={{
                color: evt.type === 'error' ? '#fb7185' : evt.type === 'success' ? '#34d399' : evt.type === 'warning' ? '#fbbf24' : 'var(--text-main)'
              }}>
                {evt.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
