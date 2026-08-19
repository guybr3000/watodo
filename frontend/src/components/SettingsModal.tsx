import React, { useState } from 'react';
import { StatusData } from '../types';
import { SettingsIcon, XIcon, CheckCircleIcon, EyeIcon, EyeOffIcon } from './Icons';

interface Props {
  status: StatusData | null;
  onClose: () => void;
  onSave: () => void;
}

export const SettingsModal: React.FC<Props> = ({ status, onClose, onSave }) => {
  const [targetChatName, setTargetChatName] = useState(status?.config.targetChatName || 'To Do');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [outputDir, setOutputDir] = useState(status?.config.outputDir || './inbox');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const hasGemini = Boolean(status?.config.hasGeminiApiKey);
  const maskedGemini = status?.config.maskedGeminiApiKey;
  const hasGithub = Boolean(status?.config.hasGithubToken);
  const maskedGithub = status?.config.maskedGithubToken;

  const saveSettings = async () => {
    try {
      const payload: any = { targetChatName, outputDir };
      if (geminiApiKey !== '') payload.geminiApiKey = geminiApiKey;
      if (githubToken !== '') payload.githubToken = githubToken;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSavedMsg('Settings & API keys saved to config.json & .env successfully!');
        onSave();
        setTimeout(onClose, 1200);
      }
    } catch {
      setSavedMsg('Failed to save settings.');
    }
  };

  const handleClearGemini = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: '' })
      });
      setGeminiApiKey('');
      setSavedMsg('Gemini API key cleared.');
      onSave();
    } catch {}
  };

  const handleClearGithub = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: '' })
      });
      setGithubToken('');
      setSavedMsg('GitHub token cleared.');
      onSave();
    } catch {}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SettingsIcon size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Settings & Configuration</h2>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <XIcon size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Target Group */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Target WhatsApp Group Chat Name
            </label>
            <input
              type="text"
              className="search-bar"
              style={{ paddingLeft: '1rem' }}
              value={targetChatName}
              onChange={e => setTargetChatName(e.target.value)}
            />
          </div>

          {/* Gemini API Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Google Gemini API Key
              </label>
              {hasGemini && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--accent-wa)',
                  background: 'rgba(37, 211, 102, 0.12)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-wa)' }}></span>
                  Saved: {maskedGemini || 'Active'}
                </span>
              )}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showGeminiKey ? 'text' : 'password'}
                className="search-bar"
                style={{ paddingLeft: '1rem', paddingRight: '4.5rem' }}
                placeholder={hasGemini ? `Saved (${maskedGemini}) — paste new key to update` : 'Paste GEMINI_API_KEY...'}
                value={geminiApiKey}
                onChange={e => setGeminiApiKey(e.target.value)}
              />
              <div style={{ position: 'absolute', right: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ padding: '4px' }}
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  title={showGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showGeminiKey ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                </button>
                {hasGemini && (
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ padding: '4px', color: 'var(--accent-danger)' }}
                    onClick={handleClearGemini}
                    title="Remove saved key"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* GitHub Token */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                GitHub Access Token (Optional)
              </label>
              {hasGithub && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  background: 'rgba(59, 130, 246, 0.12)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                  Saved: {maskedGithub || 'Active'}
                </span>
              )}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showGithubToken ? 'text' : 'password'}
                className="search-bar"
                style={{ paddingLeft: '1rem', paddingRight: '4.5rem' }}
                placeholder={hasGithub ? `Saved (${maskedGithub}) — paste new token to update` : 'Paste GITHUB_TOKEN...'}
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
              />
              <div style={{ position: 'absolute', right: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ padding: '4px' }}
                  onClick={() => setShowGithubToken(!showGithubToken)}
                  title={showGithubToken ? 'Hide token' : 'Show token'}
                >
                  {showGithubToken ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                </button>
                {hasGithub && (
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ padding: '4px', color: 'var(--accent-danger)' }}
                    onClick={handleClearGithub}
                    title="Remove saved token"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Inbox Output Directory */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Inbox Storage Output Directory
            </label>
            <input
              type="text"
              className="search-bar"
              style={{ paddingLeft: '1rem' }}
              value={outputDir}
              onChange={e => setOutputDir(e.target.value)}
            />
          </div>
        </div>

        {savedMsg && (
          <div style={{
            background: 'rgba(37, 211, 102, 0.1)',
            border: '1px solid rgba(37, 211, 102, 0.3)',
            borderRadius: '8px',
            padding: '0.65rem 1rem',
            color: 'var(--accent-wa)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.5rem'
          }}>
            <CheckCircleIcon size={16} />
            <span>{savedMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={saveSettings}>Save Changes</button>
        </div>
      </div>
    </div>
  );
};
