import DemoNotice from './demo-notice';

const steps = [
  { title: '先听懂', description: '从生活里的一段对话开始。' },
  { title: '再听一遍', description: '同一段内容，按你的节奏反复听。' },
  { title: '想说，再试着说', description: '准备好了，再和 AI 角色练习。' },
];

export default function Home() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <p className="wordmark" lang="en">Learning English<span>in Singapore</span></p>
        <span className="demo-label">流程演示</span>
      </header>

      <main>
        <div className="introduction">
          <h1>在新加坡，<span>从听懂开始。</span></h1>
          <p className="intro-copy">从买一杯咖啡，到和老师聊聊孩子。<br />让英语，一点点走进你的生活。</p>
          <DemoNotice />
        </div>

        <section className="learning-path" aria-labelledby="learning-path-title">
          <div className="path-heading">
            <h2 id="learning-path-title">未来，你可以这样练习</h2>
            <p>听优先 · 按自己的节奏</p>
          </div>
          <ol>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="step-number" aria-hidden="true">0{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="preparation-note">练习功能正在准备中。</p>
        </section>
      </main>

      <footer className="site-footer">
        <p>尊重每一种口音。<span>不必说得完美，也可以慢慢开始。</span></p>
        <p lang="en">Listen first. Your pace.</p>
      </footer>
    </div>
  );
}
