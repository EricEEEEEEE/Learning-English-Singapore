'use client';

import { useEffect, useState } from 'react';
import type { ScenarioVersion } from '../lib/scenario';
import type { EntryLanguage } from './entry-copy';

type RecordView = { id: string; goalRevision: number; playbackPositionMs: number };

const copy = {
  'zh-Hans': { title: '本地临时记录', notice: '流程演示／本地临时记录。只保存版本号和手动填写的播放位置；本机负责关联当前场景。真实声音、画面和长期保存尚未接入。服务重启后可能消失。', empty: '暂无临时记录', save: '保存本次场景', position: '播放位置（秒）', update: '更新播放位置', revoke: '撤销这条记录', remove: '删除这条记录', orphan: '无法关联到当前场景的临时记录', failure: '临时记录暂时无法保存，请稍后重试。', expired: '登录已失效，请重新登录。', version: '版本', seconds: '秒' },
  id: { title: 'Catatan sementara lokal', notice: 'Demo alur / catatan sementara lokal. Hanya nomor versi dan posisi putar manual yang disimpan; perangkat ini menghubungkan catatan ke situasi. Audio, video, dan penyimpanan jangka panjang belum tersedia. Catatan dapat hilang saat server dimulai ulang.', empty: 'Belum ada catatan sementara', save: 'Simpan situasi ini', position: 'Posisi putar (detik)', update: 'Perbarui posisi putar', revoke: 'Cabut akses catatan ini', remove: 'Hapus catatan ini', orphan: 'Catatan sementara tanpa hubungan ke situasi ini', failure: 'Catatan sementara belum dapat disimpan.', expired: 'Sesi masuk telah berakhir. Masuk lagi.', version: 'Versi', seconds: 'detik' },
  ja: { title: '一時的なローカル記録', notice: '操作デモ／一時的なローカル記録。版番号と手入力の再生位置だけを保存し、この端末で場面と結び付けます。音声・動画・長期保存は未対応です。サーバー再起動で消えることがあります。', empty: '一時記録はありません', save: 'この場面を保存', position: '再生位置（秒）', update: '再生位置を更新', revoke: 'この記録を取り消す', remove: 'この記録を削除', orphan: '現在の場面に結び付かない一時記録', failure: '一時記録を保存できません。', expired: 'ログインの有効期限が切れました。', version: 'バージョン', seconds: '秒' },
  ko: { title: '로컬 임시 기록', notice: '흐름 데모 / 로컬 임시 기록. 버전과 수동 재생 위치만 저장하고 이 기기에서 장면과 연결합니다. 실제 음성·영상과 장기 보관은 제공되지 않습니다. 서버가 다시 시작되면 사라질 수 있습니다.', empty: '임시 기록이 없습니다', save: '이 장면 저장', position: '재생 위치(초)', update: '재생 위치 업데이트', revoke: '이 기록 철회', remove: '이 기록 삭제', orphan: '현재 장면과 연결되지 않은 임시 기록', failure: '임시 기록을 저장할 수 없습니다.', expired: '로그인이 만료되었습니다. 다시 로그인하세요.', version: '버전', seconds: '초' },
  hi: { title: 'स्थानीय अस्थायी रिकॉर्ड', notice: 'फ़्लो डेमो / स्थानीय अस्थायी रिकॉर्ड। केवल संस्करण और हाथ से भरी प्लेबैक स्थिति रखी जाती है; यह डिवाइस उन्हें दृश्य से जोड़ता है। असली ऑडियो, वीडियो और लंबे समय का संग्रह उपलब्ध नहीं है। सर्वर पुनः शुरू होने पर रिकॉर्ड मिट सकता है।', empty: 'कोई अस्थायी रिकॉर्ड नहीं', save: 'यह दृश्य सहेजें', position: 'प्लेबैक स्थिति (सेकंड)', update: 'प्लेबैक स्थिति अपडेट करें', revoke: 'यह रिकॉर्ड वापस लें', remove: 'यह रिकॉर्ड मिटाएँ', orphan: 'वर्तमान दृश्य से न जुड़ा अस्थायी रिकॉर्ड', failure: 'अस्थायी रिकॉर्ड अभी सहेजा नहीं जा सका।', expired: 'लॉगिन समाप्त हो गया है। फिर लॉगिन करें।', version: 'संस्करण', seconds: 'सेकंड' },
} satisfies Record<EntryLanguage, Record<string, string>>;

async function send(method: string, body?: object) {
  return fetch('/api/private-demo', {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionExpired() {
  window.dispatchEvent(new Event('le-sg-auth-invalid'));
}

export default function PrivateDemoPanel({ language, version, instanceId }: { language: EntryLanguage; version: ScenarioVersion; instanceId: string }) {
  const c = copy[language];
  const [records, setRecords] = useState<RecordView[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [position, setPosition] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'failure' | 'expired' | null>(null);
  const linkKey = `le-sg-private-link-v1:${instanceId}`;
  const selected = records.find(record => record.id === links[version.id]);
  const unlinked = records.filter(record => !Object.values(links).includes(record.id));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(linkKey);
      const value: unknown = saved ? JSON.parse(saved) : {};
      setLinks(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {});
    } catch { setLinks({}); }
  }, [linkKey]);

  function remember(next: Record<string, string>) {
    setLinks(next);
    try { localStorage.setItem(linkKey, JSON.stringify(next)); } catch { setError('failure'); }
  }

  useEffect(() => {
    let active = true;
    void send('GET').then(async response => {
      if (!active) return;
      if (response.status === 401) { setError('expired'); setRecords([]); sessionExpired(); return; }
      if (!response.ok) { setError('failure'); return; }
      const result = await response.json() as { records?: RecordView[] };
      if (active) { setRecords(Array.isArray(result.records) ? result.records : []); setError(null); }
    }).catch(() => { if (active) setError('failure'); });
    return () => { active = false; };
  }, []);

  useEffect(() => { setPosition(String(Math.floor((selected?.playbackPositionMs ?? 0) / 1000))); }, [selected?.id, selected?.playbackPositionMs]);

  async function perform(method: 'POST' | 'PATCH' | 'DELETE', body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await send(method, body);
      if (response.status === 401) { setError('expired'); setRecords([]); sessionExpired(); return; }
      if (!response.ok) { setError('failure'); return; }
      if (method === 'DELETE') {
        const id = (body as { id: string }).id;
        setRecords(current => current.filter(record => record.id !== id));
        remember(Object.fromEntries(Object.entries(links).filter(([, linked]) => linked !== id)));
        return;
      }
      const result = await response.json() as { record?: RecordView };
      if (!result.record) { setError('failure'); return; }
      setRecords(current => [...current.filter(record => record.id !== result.record!.id), result.record!]);
      if (method === 'POST') remember({ ...links, [version.id]: result.record.id });
    } catch { setError('failure'); }
    finally { setBusy(false); }
  }

  const seconds = Number(position);
  const validSeconds = Number.isSafeInteger(seconds) && seconds >= 0 && Number.isSafeInteger(seconds * 1000);
  return <section className="scene-private-demo" role="region" aria-label={c.title}>
    <h2>{c.title}</h2>
    <p>{c.notice}</p>
    {error && <p role="status">{c[error]}</p>}
    {!records.length && error !== 'expired' && <p>{c.empty}</p>}
    {selected && <p>{c.version} {selected.goalRevision} · {Math.floor(selected.playbackPositionMs / 1000)} {c.seconds}</p>}
    {!!unlinked.length && <div><p>{c.orphan}</p><ul>{unlinked.map(record => <li key={record.id}>
      {c.version} {record.goalRevision} · {Math.floor(record.playbackPositionMs / 1000)} {c.seconds}
      <button type="button" disabled={busy} onClick={() => void perform('DELETE', { id: record.id, action: 'delete' })}>{c.remove}</button>
    </li>)}</ul></div>}
    {error !== 'expired' && (selected ? <>
      <label htmlFor="private-demo-position">{c.position}</label>
      <input id="private-demo-position" type="number" min="0" step="1" inputMode="numeric" value={position} onChange={event => setPosition(event.target.value)} />
      <button type="button" disabled={busy || !validSeconds} onClick={() => void perform('PATCH', { id: selected.id, playbackPositionMs: seconds * 1000 })}>{c.update}</button>
      <button type="button" disabled={busy} onClick={() => void perform('DELETE', { id: selected.id, action: 'revoke' })}>{c.revoke}</button>
      <button type="button" disabled={busy} onClick={() => void perform('DELETE', { id: selected.id, action: 'delete' })}>{c.remove}</button>
    </> : <button type="button" disabled={busy} onClick={() => void perform('POST', { goalRevision: version.goal_revision, playbackPositionMs: 0 })}>{c.save}</button>)}
  </section>;
}
