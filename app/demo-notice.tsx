'use client';

import { useState } from 'react';
import type { EntryCopy } from './entry-copy';

export default function DemoNotice({ copy }: { copy: EntryCopy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="demo-notice">
      <button
        type="button"
        className="demo-toggle"
        aria-expanded={expanded}
        aria-controls="demo-explanation"
        onClick={() => setExpanded(current => !current)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 11v6M12 7v1" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {expanded ? copy.notice.close : copy.notice.open}
        <span className="toggle-sign" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <section
        id="demo-explanation"
        className="demo-explanation"
        role="region"
        aria-labelledby="demo-explanation-title"
        hidden={!expanded}
      >
        <h2 id="demo-explanation-title">{copy.notice.title}</h2>
        {copy.notice.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {expanded && <p>{copy.respect}</p>}
      </section>
    </div>
  );
}
