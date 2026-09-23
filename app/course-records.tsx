'use client';

import { useEffect, useRef, useState } from 'react';
import type { SyntheticLesson } from '../lib/lesson-contract';
import type { FixedLessonProgress, FixedLessonSession } from '../lib/fixed-lesson-practice';
import type { CourseLanguage } from '../lib/synthetic-courses';

export type CourseRecord = { id: string; lesson: SyntheticLesson; lessonProgress: FixedLessonProgress };
export const courseRecordNotices = {
  'zh-Hans': { expired: '登录已失效。请重新登录后保存课程。', language: '请切换回这条课程原来的辅助语言后恢复。' },
  id: { expired: 'Login kedaluwarsa. Masuk lagi untuk menyimpan.', language: 'Ganti ke bahasa bantuan asli pelajaran ini untuk memulihkannya.' },
  ja: { expired: 'ログインの期限が切れました。保存するには再ログインしてください。', language: '復元するには、このレッスンの元の補助言語に切り替えてください。' },
  ko: { expired: '로그인이 만료되었습니다. 저장하려면 다시 로그인하세요.', language: '복원하려면 이 수업의 원래 보조 언어로 전환하세요.' },
  hi: { expired: 'लॉगिन समाप्त हो गया। सहेजने के लिए फिर लॉगिन करें।', language: 'बहाल करने के लिए इस पाठ की मूल सहायक भाषा चुनें।' },
};
const copies = {
  'zh-Hans': ['合成课程临时记录', '登录 Google 后才能保存', '仅保存在服务器内存，服务重启后可能消失。恢复句子和模式，不自动播放；循环范围不保留。每次请求最多 4KB。', '保存当前课程与位置', '恢复这条课程', '删除这条课程', '撤销这条课程', '已保存', '暂时无法保存，请重试。', '内容无效或超过 4KB，未完成保存。', '无法恢复这条课程。', '暂无课程记录', '课程已建立，但位置未保存；请重试保存。', '正在处理……'],
  id: ['Catatan pelajaran sementara', 'Masuk dengan Google untuk menyimpan', 'Hanya dalam memori server; dapat hilang saat server dimulai ulang. Pulihkan kalimat dan mode tanpa memutar otomatis. Rentang ulang tidak disimpan. Maksimal 4KB per permintaan.', 'Simpan pelajaran dan posisi', 'Pulihkan pelajaran', 'Hapus pelajaran', 'Cabut pelajaran', 'Tersimpan', 'Belum dapat menyimpan. Coba lagi.', 'Konten tidak valid atau melebihi 4KB; belum tersimpan.', 'Pelajaran tidak dapat dipulihkan.', 'Belum ada catatan', 'Pelajaran dibuat, tetapi posisi belum tersimpan. Coba simpan lagi.', 'Memproses…'],
  ja: ['レッスンの一時記録', '保存するには Google でログイン', 'サーバーメモリのみ。再起動で消える場合があります。文とモードを復元し、自動再生しません。繰り返し範囲は保存しません。リクエストは最大4KB。', 'レッスンと位置を保存', 'レッスンを復元', 'レッスンを削除', 'レッスンを取り消す', '保存しました', '現在保存できません。再試行してください。', '内容が無効または4KB超過のため保存未完了です。', '復元できません。', '記録はありません', 'レッスンは作成されましたが位置は未保存です。再試行してください。', '処理中…'],
  ko: ['수업 임시 기록', '저장하려면 Google 로그인', '서버 메모리에만 저장되어 재시작 시 사라질 수 있습니다. 문장과 모드를 복원하며 자동 재생하지 않습니다. 반복 범위는 저장하지 않습니다. 요청당 최대 4KB입니다.', '수업과 위치 저장', '수업 복원', '수업 삭제', '수업 철회', '저장됨', '지금 저장할 수 없습니다. 다시 시도하세요.', '잘못된 내용 또는 4KB 초과로 저장하지 못했습니다.', '수업을 복원할 수 없습니다.', '기록 없음', '수업은 생성되었지만 위치는 저장되지 않았습니다. 다시 저장하세요.', '처리 중…'],
  hi: ['पाठ के अस्थायी रिकॉर्ड', 'सहेजने के लिए Google से लॉगिन करें', 'केवल सर्वर मेमोरी में; सर्वर फिर शुरू होने पर मिट सकता है। वाक्य और मोड बहाल होते हैं, अपने आप नहीं चलता। दोहराव सीमा नहीं सहेजी जाती। हर अनुरोध अधिकतम 4KB।', 'पाठ और स्थान सहेजें', 'पाठ बहाल करें', 'पाठ मिटाएँ', 'पाठ वापस लें', 'सहेजा गया', 'अभी सहेज नहीं सकते। फिर कोशिश करें।', 'अमान्य सामग्री या 4KB से अधिक; सहेजना पूरा नहीं हुआ।', 'पाठ बहाल नहीं हो सकता।', 'कोई रिकॉर्ड नहीं', 'पाठ बना है पर स्थान नहीं सहेजा गया। फिर सहेजें।', 'प्रक्रिया जारी…'],
} satisfies Record<CourseLanguage, string[]>;

export default function CourseRecords({ language, authenticated, verified, lesson, state, recordId, onSaved, onRestore }: {
  language: CourseLanguage; authenticated: boolean; verified: boolean; lesson: SyntheticLesson; state: FixedLessonSession; recordId: string | null;
  onSaved: (id: string | null) => void; onRestore: (record: CourseRecord) => void;
}) {
  const c = copies[language];
  const [records, setRecords] = useState<CourseRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(authenticated);
  const [message, setMessage] = useState('');
  const alive = useRef(false);
  const locked = useRef(false);

  async function send(method: string, body?: object) {
    const json = body === undefined ? undefined : JSON.stringify(body);
    if (json && new TextEncoder().encode(json).byteLength > 4096) throw new Error(c[9]);
    const response = await fetch('/api/private-demo', { method, credentials: 'same-origin', cache: 'no-store',
      headers: json ? { 'content-type': 'application/json' } : undefined, body: json });
    if (!alive.current) throw new Error('inactive');
    if (response.status === 401) {
      setRecords([]); window.dispatchEvent(new Event('le-sg-auth-invalid')); throw new Error(c[1]);
    }
    if (!response.ok) throw new Error(response.status === 400 || response.status === 413 ? c[9] : c[8]);
    return response.status === 204 ? null : response.json();
  }
  useEffect(() => {
    alive.current = true;
    if (authenticated) void send('GET').then(result => {
      if (alive.current) setRecords((result.records ?? []).filter((record: CourseRecord) => record.lesson && record.lessonProgress));
    }).catch(error => { if (alive.current) setMessage(error.message); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [authenticated]);

  async function run(action: () => Promise<void>) {
    if (locked.current || loading || !verified) return;
    locked.current = true; setBusy(true); setMessage('');
    try { await action(); } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : c[8]);
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function save() {
    let id = recordId;
    if (!id) {
      const result = await send('POST', { goalRevision: lesson.goal_revision, playbackPositionMs: 0, lesson, learnerRole: state.learner_role_id });
      if (!alive.current) return;
      id = result.record.id; onSaved(id);
      setRecords(current => [...current, result.record]);
    }
    const lessonProgress = { lesson_revision: state.lesson_revision, sentence_id: state.material.sentences[state.position].id,
      mode: state.mode, learner_role_id: state.learner_role_id };
    try {
      const result = await send('PATCH', { id, playbackPositionMs: 0, lessonProgress });
      if (!alive.current) return;
      setRecords(current => current.map(record => record.id === id ? result.record : record)); setMessage(c[7]);
    } catch (error) {
      if (!recordId && alive.current) throw new Error(c[12]);
      throw error;
    }
  }
  return <section className="course-controls" role="region" aria-label={c[0]}>
    <h2>{c[0]}</h2><p>{c[2]}</p>
    {!verified ? <p>{c[13]}</p> : !authenticated ? <p>{c[1]}</p> : <>
      <button className="guide-primary" type="button" disabled={busy || loading} onClick={() => void run(save)}>{c[3]}</button>
      <p role="status">{busy ? c[13] : message}</p>
      {!records.length && <p>{c[11]}</p>}
      <ul>{records.map(record => <li key={record.id}>
        <p lang="en">{record.lesson.user_goal}</p>
        {record.lesson.auxiliary_language !== language && <p>{courseRecordNotices[language].language} ({record.lesson.auxiliary_language})</p>}
        <button type="button" disabled={busy || record.lesson.auxiliary_language !== language} onClick={() => { try { onRestore(record); setMessage(''); } catch { setMessage(c[10]); } }}>{c[4]}</button>
        {(['delete', 'revoke'] as const).map((action, index) => <button key={action} type="button" disabled={busy} onClick={() => void run(async () => {
          await send('DELETE', { id: record.id, action });
          if (!alive.current) return;
          setRecords(current => current.filter(item => item.id !== record.id));
          if (recordId === record.id) onSaved(null);
        })}>{c[5 + index]}</button>)}
      </li>)}</ul>
    </>}
  </section>;
}
