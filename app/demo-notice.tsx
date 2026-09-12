'use client';

import { useState } from 'react';

export default function DemoNotice() {
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
        {expanded ? '收起演示说明' : '查看演示说明'}
        <span className="toggle-sign" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <section
        id="demo-explanation"
        className="demo-explanation"
        role="region"
        aria-labelledby="demo-explanation-title"
        hidden={!expanded}
      >
        <h2 id="demo-explanation-title">演示说明</h2>
        <p>这是本地流程演示。真实登录、语音和视频尚未接入，暂时不能开始正式练习。</p>
        <p>你可以先了解练习方式。这里不会录音，也不会连接真实账号。</p>
      </section>
    </div>
  );
}
