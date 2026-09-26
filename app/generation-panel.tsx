'use client';
import { useEffect, useRef, useState } from 'react';
import RealSceneCourse from './real-scene-course';
import type { EntryLanguage } from './entry-copy';
const copy = {
  'zh-Hans': ['场景生成任务', '生成场景需求', '创建生成任务', '等待费用放行 · 尚未生成', '请先登录；本地服务还需配置才能保存任务。', '返回', '正在保存', '提交未确认，请重试；同一需求不会重复建任务。', '提交结果未知，已暂停，不会自动重发', '模拟任务，不是真实生成'],
  id: ['Tugas pembuatan situasi', 'Kebutuhan situasi', 'Buat tugas', 'Menunggu persetujuan biaya · Belum dibuat', 'Masuk dahulu; layanan lokal perlu dikonfigurasi.', 'Kembali', 'Menyimpan', 'Belum terkonfirmasi. Coba lagi; permintaan sama tidak diduplikasi.', 'Hasil belum diketahui. Dijeda tanpa mengirim ulang.', 'Tugas simulasi, bukan pembuatan nyata'],
  ja: ['場面生成タスク', '希望する場面', 'タスクを作成', '費用承認待ち・まだ生成されていません', 'ログインとローカルサービスの設定が必要です。', '戻る', '保存中', '未確認です。再試行しても同じ要求は重複しません。', '結果不明のため停止中。自動再送しません。', 'シミュレーション。実際の生成ではありません'],
  ko: ['상황 생성 작업', '원하는 상황', '작업 만들기', '비용 승인 대기 · 아직 생성되지 않음', '로그인과 로컬 서비스 설정이 필요합니다.', '돌아가기', '저장 중', '확인되지 않았습니다. 다시 시도해도 같은 요청은 중복되지 않습니다.', '결과를 알 수 없어 중지했습니다. 자동 재전송하지 않습니다.', '시뮬레이션이며 실제 생성이 아닙니다'],
  hi: ['दृश्य निर्माण कार्य', 'मनचाहा दृश्य', 'कार्य बनाएँ', 'खर्च की अनुमति की प्रतीक्षा · अभी नहीं बना', 'पहले साइन इन करें; स्थानीय सेवा का सेटअप ज़रूरी है।', 'वापस', 'सहेज रहे हैं', 'पुष्टि नहीं हुई। फिर कोशिश करें; वही अनुरोध दोहराया नहीं जाएगा।', 'परिणाम अज्ञात है। अपने आप दोबारा नहीं भेजेंगे।', 'यह अनुकरण है, वास्तविक निर्माण नहीं'],
};
export const generationTitle = (language: EntryLanguage) => copy[language][0];
type Task = { id: string; goal: string; status: string; revision?: number; simulation?: boolean };
export default function GenerationPanel({ language, onBack }: { language: EntryLanguage; onBack: () => void }) {
  const [opened, setOpened] = useState<{ id: string; revision: number } | null>(null);
  const openLabel = { 'zh-Hans': '打开已保存课程', id: 'Buka pelajaran tersimpan', ja: '保存済み教材を開く', ko: '저장된 수업 열기', hi: 'सहेजा गया पाठ खोलें' }[language];
  const text = copy[language]; const [goal, setGoal] = useState(''); const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<number | null>(null);
  const live = useRef(true); const key = useRef(''); const inFlight = useRef(false); const submitted = useRef(false);
  useEffect(() => {
    live.current = true; const controller = new AbortController();
    fetch('/api/generation-tasks', { signal: controller.signal }).then(async r => {
      if (!r.ok) { if (live.current && !submitted.current) setError(4); return; }
      const data = await r.json(); if (live.current && !submitted.current && Array.isArray(data.tasks)) setTasks(data.tasks);
    }).catch(() => { if (live.current && !submitted.current) setError(7); });
    return () => { live.current = false; controller.abort(); };
  }, []);
  async function submit() {
    if (inFlight.current || !goal.trim()) return;
    inFlight.current = true; submitted.current = true; setBusy(true); setError(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const r = await fetch('/api/generation-tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, revision: 1, requestKey: key.current }) });
      if (!r.ok) { if (live.current) setError(r.status === 401 || r.status === 503 ? 4 : 7); return; }
      const task = await r.json(); if (live.current) setTasks(previous => [task, ...previous.filter(t => t.id !== task.id)]);
    } catch { if (live.current) setError(7); }
    finally { inFlight.current = false; if (live.current) setBusy(false); }
  }
  if (opened) return <RealSceneCourse key={`${opened.id}-${opened.revision}`} language={language} saved={opened} onBack={() => setOpened(null)} />;
  return <section className="real-scene"><h1>{text[0]}</h1>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}><label htmlFor="generation-goal">{text[1]}</label><textarea id="generation-goal" value={goal} maxLength={2000} disabled={busy} onChange={e => { setGoal(e.target.value); key.current = ''; }} style={{ width: '100%', minHeight: 120 }} /><button disabled={busy || !goal.trim()}>{busy ? text[6] : text[2]}</button></form>
    {error !== null && <p role="alert">{text[error]}</p>}
    <div role="status">{tasks.map(task => <article className="scene-card" key={task.id}><p>{task.goal}</p><p>{task.simulation ? text[9] : ''} {task.status === 'video_assembled' ? openLabel : task.status === 'awaiting_budget' ? text[3] : text[8]}</p>{task.status === 'video_assembled' && Number.isSafeInteger(task.revision) && task.revision! > 0 && <button type="button" data-testid="generated-course-open" onClick={() => setOpened({ id: task.id, revision: task.revision! })}>{openLabel}</button>}</article>)}</div>
    <button onClick={onBack}>{text[5]}</button>
  </section>;
}
