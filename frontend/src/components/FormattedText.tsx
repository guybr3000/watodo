import React from 'react';
import { ExternalLinkIcon } from './Icons';

interface FormattedTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  showIcon?: boolean;
}

export const FormattedText: React.FC<FormattedTextProps> = ({
  text,
  className = '',
  style = {},
  showIcon = true
}) => {
  if (!text) return null;

  // Function to parse inline tokens: markdown links, raw URLs, bold, italic, code
  const renderFormattedTokens = (raw: string): React.ReactNode[] => {
    // Combined regex for:
    // 1. Markdown link: \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)
    // 2. Raw URL: (https?:\/\/[^\s<>()]+|(?:www\.)[^\s<>()]+)
    // 3. Bold: \*\*([^*]+)\*\*
    // 4. Italic: \*([^*]+)\*
    // 5. Code: `([^`]+)`
    const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>()]+|(?:www\.)[^\s<>()]+)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/gi;

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    let keyIdx = 0;

    while ((match = pattern.exec(raw)) !== null) {
      // Add plain text before match
      if (match.index > lastIndex) {
        elements.push(raw.substring(lastIndex, match.index));
      }

      const [
        fullMatch,
        mdLink,
        mdText,
        mdUrl,
        rawUrl,
        boldFull,
        boldText,
        italicFull,
        italicText,
        codeFull,
        codeText
      ] = match;

      if (mdLink && mdUrl) {
        // [Link Title](url)
        elements.push(
          <a
            key={`link-${keyIdx++}`}
            href={mdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rich-interactive-link"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{mdText}</span>
            {showIcon && <ExternalLinkIcon size={12} className="link-ext-icon" />}
          </a>
        );
      } else if (rawUrl) {
        // Raw URL
        let cleanUrl = rawUrl;
        // Strip trailing punctuation often caught in sentences
        let trailingPunct = '';
        const punctMatch = cleanUrl.match(/[.,;:!?)]+$/);
        if (punctMatch) {
          trailingPunct = punctMatch[0];
          cleanUrl = cleanUrl.substring(0, cleanUrl.length - trailingPunct.length);
        }

        const href = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        elements.push(
          <React.Fragment key={`rawurl-${keyIdx++}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rich-interactive-link"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{cleanUrl}</span>
              {showIcon && <ExternalLinkIcon size={12} className="link-ext-icon" />}
            </a>
            {trailingPunct}
          </React.Fragment>
        );
      } else if (boldFull && boldText) {
        elements.push(
          <strong key={`bold-${keyIdx++}`} style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            {renderFormattedTokens(boldText)}
          </strong>
        );
      } else if (italicFull && italicText) {
        elements.push(
          <em key={`italic-${keyIdx++}`} style={{ fontStyle: 'italic' }}>
            {renderFormattedTokens(italicText)}
          </em>
        );
      } else if (codeFull && codeText) {
        elements.push(
          <code
            key={`code-${keyIdx++}`}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '2px 5px',
              borderRadius: '4px',
              fontSize: '0.88em',
              fontFamily: 'monospace'
            }}
          >
            {codeText}
          </code>
        );
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < raw.length) {
      elements.push(raw.substring(lastIndex));
    }

    return elements;
  };

  // Split by newlines to render multi-line paragraphs cleanly
  const lines = text.split('\n');

  return (
    <div className={`formatted-text-container ${className}`} style={{ ...style }}>
      {lines.map((line, lIdx) => (
        <React.Fragment key={lIdx}>
          {renderFormattedTokens(line)}
          {lIdx < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
};
