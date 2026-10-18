// C15-2: real spot check of the C6-C9 / C12-C13 prompt rules with the repo's own provider code (paid, user-approved
// 2026-10-18, ledger reserve <= USD0.9). Learner speech is replaced by a written transcript fed straight to the reply
// model; no audio is transcribed and no reply is voiced. Each request is reserved first, made once, never retried.
// Run: OPENAI_API_KEY="$OPEN_API_KEY" NODE_USE_ENV_PROXY=1 node --experimental-strip-types --no-warnings \
//        --import ./scripts/c15/ts-loader.mjs scripts/c15/prompt-spotcheck.mjs [--script] [--turns] [--recheck [--round 2]] [--out dir]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { respondInScene, suggestInEnglish } from '../../lib/practice-providers.ts';
import { quotesOnlyLearnerWords, isNativeAnswer } from '../../lib/practice-turn.ts';
import { generateSceneScript, validateGeneratedScript } from '../../lib/generated-script.ts';
import { sceneSafetyKind } from '../../lib/scene-safety.ts';
import { openLedger, responseCost, responseReserve, capturingFetch } from './ledger.mjs';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY missing');
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : `/mnt/project-files/les-c15/${args.includes('--recheck') ? (args.includes('--round') ? `prompt-recheck-${args[args.indexOf('--round') + 1]}` : 'prompt-recheck') : 'prompt-spotcheck'}`;
mkdirSync(outDir, { recursive: true });
const ledger = openLedger();
const ITEM = 'C15-2';

// Fictional scenes written for this check (no real names or policies).
const hawker = [
  { role: 'partner', text: 'Hi, what would you like today?' },
  { role: 'learner', text: 'One chicken rice, please.' },
  { role: 'partner', text: 'Steamed or roasted chicken? You want chili or not?' },
  { role: 'learner', text: 'Steamed, with a little chili, please.' },
  { role: 'partner', text: 'Okay. Eat here or take away?' },
  { role: 'learner', text: 'Eat here, please. How much is it?' },
  { role: 'partner', text: 'Four fifty. You can pay by PayNow or cash.' },
  { role: 'learner', text: 'Cash. Here you go. Thank you.' },
];
const office = [
  { role: 'partner', text: 'Good morning. How can I help you at the service centre today?' },
  { role: 'learner', text: 'Good morning. I want to collect my work pass card.' },
  { role: 'partner', text: 'Do you have your appointment letter and your passport?' },
  { role: 'learner', text: 'Yes, here they are.' },
  { role: 'partner', text: 'Thank you. Please take this number and wait for your turn.' },
  { role: 'learner', text: 'Okay, thank you very much.' },
];

let clinic = null; // filled from the real script generation (C13-3) or the fallback below
const clinicFallback = [
  { role: 'partner', text: 'Good morning. Do you have an appointment at the polyclinic today?' },
  { role: 'learner', text: 'No, I do not. I have a cough for three days.' },
  { role: 'partner', text: 'Okay. Please show me your IC or passport, and take a queue number.' },
  { role: 'learner', text: 'Here is my passport. How long is the wait?' },
  { role: 'partner', text: 'About forty minutes. The doctor will see you soon.' },
  { role: 'learner', text: 'Okay, thank you. I will wait here.' },
];

const resultsFile = join(outDir, 'results.json');
const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
const record = r => { results.push(r); writeFileSync(resultsFile, JSON.stringify(results, null, 2)); };

async function paid(label, model, maxOutput, estimateChars, run) {
  const { send, calls } = capturingFetch();
  const hold = ledger.reserve(ITEM, label, responseReserve(model, estimateChars, maxOutput));
  let value, error;
  try { value = await run(send); } catch (e) { error = e instanceof Error ? e.message : 'error'; }
  const call = calls.at(-1);
  if (call?.usage) hold.settle(responseCost(model, call.usage), { input_tokens: call.usage.input_tokens, output_tokens: call.usage.output_tokens });
  else hold.unknown(error ?? 'no usage');
  return { value, error, call: call ? { status: call.status, responseStatus: call.responseStatus, incomplete: call.incomplete, usage: call.usage ? { input_tokens: call.usage.input_tokens, output_tokens: call.usage.output_tokens } : null, outputText: call.outputText } : null };
}

// ---- C13-3: one real script generation (gpt-4.1, max_output_tokens 4000) with the new register fields ----
if (args.includes('--script')) {
  const requirement = {
    description: '我第一次去综合诊所（polyclinic）看咳嗽，要在柜台登记、问要等多久。',
    language: 'zh-Hans',
    keywords: { location: 'polyclinic registration counter', learnerRole: 'patient', partnerRole: 'clinic counter staff', topic: 'registering for a cough', goal: 'register and ask how long the wait is', special: '' },
  };
  const r = await paid('script-generation clinic', 'gpt-4.1', 4000, 21_000, send => generateSceneScript({ goal: requirement.description, requirement }, { enabled: true, apiKey, fetch: send }));
  let parsed = null, issues = null;
  try { parsed = JSON.parse(r.call?.outputText ?? ''); const checked = validateGeneratedScript(parsed); issues = checked.ok ? [] : checked.issues; } catch { issues = ['unparsable']; }
  record({ id: 'S1', rule: 'C13-3 script contract', error: r.error ?? null, call: { ...r.call, outputText: undefined }, issues, script: parsed });
  writeFileSync(join(outDir, 'script-clinic.json'), JSON.stringify(parsed, null, 2));
}
const scriptFile = existsSync(join(outDir, 'script-clinic.json')) ? join(outDir, 'script-clinic.json') : '/mnt/project-files/les-c15/prompt-spotcheck/script-clinic.json';
if (existsSync(scriptFile)) {
  try { const s = JSON.parse(readFileSync(scriptFile, 'utf8')); if (Array.isArray(s?.lines)) clinic = s.lines.map(l => ({ role: l.role, text: l.text })); } catch { /* fallback */ }
}
clinic ??= clinicFallback;

const pair = (lines, turnIndex) => ({ partnerLine: lines[turnIndex * 2].text, expectedLearnerLine: lines[turnIndex * 2 + 1].text });
const base = (lines, turnIndex, transcript, over = {}) => ({
  ...pair(lines, turnIndex), sceneLines: lines, transcript, history: [], language: 'zh-Hans', focus: 'normal', correction: 'normal', goal: null,
  safety: sceneSafetyKind({ description: lines.map(l => l.text).join(' '), keywords: {} }), ...over,
});
const lastPair = lines => lines.length / 2 - 1;
const historyUpTo = (lines, n) => Array.from({ length: n }, (_, i) => ({ learner: lines[i * 2 + 1].text, partner: lines[i * 2 + 2].text }));

// Each case: rule id, what a compliant answer looks like, and the context fed to the model.
const cases = [
  // R1 natural continuation
  { id: 'R1a', rule: 'R1 自然继续', expect: 'understood true, done false, continues the order', ctx: base(hawker, 0, 'One chicken rice, please.') },
  { id: 'R1b', rule: 'R1 自然继续', expect: 'understood true, done false, continues to the next step', ctx: base(hawker, 1, 'Steamed. A little chili.', { history: historyUpTo(hawker, 1) }) },
  // R2 reasonable different answer accepted
  { id: 'R2a', rule: 'R2 合理偏题被接受', expect: 'accepts roasted, no recitation, understood true', ctx: base(hawker, 1, 'Roasted one, no chili. My child eats also.', { history: historyUpTo(hawker, 1) }) },
  { id: 'R2b', rule: 'R2 合理偏题被接受', expect: 'answers the question back, understood true', ctx: base(hawker, 0, 'Is the chicken rice spicy?') },
  { id: 'R2c', rule: 'R2 合理偏题被接受', expect: 'accepts take away, does not insist on eat here', ctx: base(hawker, 2, 'Take away, please.', { history: historyUpTo(hawker, 2) }) },
  // R3 one clarification when unclear / off-topic
  { id: 'R3a', rule: 'R3 一次澄清', expect: 'understood false, one short clarifying question', ctx: base(hawker, 0, 'Uh... the... rice... ah...') },
  { id: 'R3b', rule: 'R3 一次澄清', expect: 'understood false, one short clarifying question back to the order', ctx: base(hawker, 0, 'My son goes to school near here.') },
  { id: 'R3c', rule: 'R3 一次澄清', expect: 'understood false, one question only', ctx: base(office, 1, 'Letter... no... the email?', { history: historyUpTo(office, 1) }) },
  // R4 light correction (normal)
  { id: 'R4a', rule: 'R4 轻纠错', expect: 'coachNote null or one short point in Chinese; small mistake may be left alone', ctx: base(hawker, 0, 'I want one chicken rices.') },
  { id: 'R4b', rule: 'R4 轻纠错', expect: 'at most one key point in Chinese, under 120 chars', ctx: base(hawker, 1, 'Chili no want, chicken the steam.', { history: historyUpTo(hawker, 1) }) },
  { id: 'R4c', rule: 'R4 轻纠错', expect: 'coachNote null (correct answer)', ctx: base(hawker, 2, 'Eat here, please.', { history: historyUpTo(hawker, 2) }) },
  // R5 less correction
  { id: 'R5a', rule: 'R5 少纠正', expect: 'coachNote null (meaning clear)', ctx: base(hawker, 0, 'I want one chicken rices.', { correction: 'less' }) },
  { id: 'R5b', rule: 'R5 少纠正', expect: 'coachNote null (meaning clear)', ctx: base(hawker, 1, 'Chili no want, chicken the steam.', { correction: 'less', history: historyUpTo(hawker, 1) }) },
  // R6 coachNote quotes only learner words (C12-2)
  { id: 'R6a', rule: 'R6 coachNote 只引用说过的话', expect: 'any quoted words come from the transcript; suggestion unquoted', ctx: base(hawker, 3, 'I pay the cash. Thanks you.', { history: historyUpTo(hawker, 3) }) },
  { id: 'R6b', rule: 'R6 coachNote 只引用说过的话', expect: 'any quoted words come from the transcript; suggestion unquoted', ctx: base(office, 1, 'Yes I have bring the passport and letter.', { history: historyUpTo(office, 1) }) },
  // R7 goal change
  { id: 'R7a', rule: 'R7 改目标 goalChange', expect: 'goalChange object, reply is the confirm yes/no question, done false', ctx: base(hawker, 0, 'Can I order three packets to take home for my family instead?') },
  { id: 'R7b', rule: 'R7 改目标 goalChange', expect: 'goalChange object (another time), done false', ctx: base(office, 1, 'Sorry, can I come back tomorrow afternoon instead? I forgot my passport.', { history: historyUpTo(office, 1) }) },
  { id: 'R7c', rule: 'R7 改目标 goalChange', expect: 'with currentGoal confirmed: follows the new task (three packets), goalChange null', ctx: base(hawker, 0, 'Yes, three packets to take home.', { history: [{ learner: 'Can I order three packets to take home for my family instead?', partner: 'You want three packets of chicken rice to take away, right?' }], goal: { revision: 1, summary: '打包三份鸡饭带回家' } }) },
  // R8 native-language mode suggestion
  { id: 'R8a', rule: 'R8 母语模式建议句', native: true, expect: 'understood true, one short English sentence (less chili), does not reply as partner', ctx: base(hawker, 1, '我想要鸡肉是白切的，辣椒少一点。') },
  { id: 'R8b', rule: 'R8 母语模式建议句', native: true, expect: 'understood true, short English sentence (forgot passport), not a partner reply', ctx: { ...base(office, 1, 'Saya lupa bawa paspor saya. Bisa datang lagi besok?'), language: 'id' } },
  { id: 'R8c', rule: 'R8 母语模式建议句', native: true, expect: 'understood false, suggestion null', ctx: base(hawker, 0, '嗯……那个……') },
  // R9 focus unclear (hard to catch speech)
  { id: 'R9a', rule: 'R9 多练听不清', expect: 'reductions / connected speech or asks learner to confirm what they heard', ctx: base(hawker, 2, 'Eat here.', { focus: 'unclear', history: historyUpTo(hawker, 2) }) },
  { id: 'R9b', rule: 'R9 多练听不清', expect: 'reductions / connected speech or asks learner to confirm what they heard', ctx: base(office, 1, 'Yes, here they are.', { focus: 'unclear', history: historyUpTo(office, 1) }) },
  // R10 medical / official: no conclusions
  { id: 'R10a', rule: 'R10 医疗不下结论', expect: 'no diagnosis or medicine advice; the doctor will decide', ctx: () => base(clinic, 1, 'Is it serious? What medicine should I take for my cough?', { history: historyUpTo(clinic, 1) }) },
  { id: 'R10b', rule: 'R10 医疗不下结论', expect: 'no diagnosis (dengue?); doctor decides', ctx: () => base(clinic, 0, 'I have fever and red spots. Is it dengue?') },
  { id: 'R10c', rule: 'R10 办事不下结论', expect: 'no approval conclusion; the officer / office decides', ctx: base(office, 1, 'Will my work pass be approved for sure? My employer applied last week.', { history: historyUpTo(office, 1) }) },
  { id: 'R10d', rule: 'R10 办事不下结论', expect: 'no legal conclusion; the office decides', ctx: base(office, 2, 'Can I change my job next month with this pass? Is it allowed?', { history: historyUpTo(office, 2) }) },
  // R11 natural ending
  { id: 'R11a', rule: 'R11 自然结束', expect: 'done true, short polite close, no new question', ctx: base(hawker, lastPair(hawker), 'Cash. Here you go. Thank you.', { history: historyUpTo(hawker, lastPair(hawker)) }) },
  { id: 'R11b', rule: 'R11 自然结束', expect: 'done true, short polite close, no new question', ctx: base(office, lastPair(office), 'Okay, thank you very much.', { history: historyUpTo(office, lastPair(office)) }) },
];

// C15-2 re-check (user-approved 2026-10-18 under the same C15-2 cap; this run reserves at most USD0.05): the five rules
// fixed in C15-2a (afec873 -> 45c85d5) plus the quoted-suggestion loss (R4b), 2 turns each, labels prefixed "RC-".
const RECHECK_BUDGET = 0.05;
const recheckCases = [
  { id: 'RC-R7a', rule: 'R7 改目标 goalChange', expect: 'goalChange object, reply is the confirm yes/no question, done false', ctx: base(hawker, 0, 'Can I order three packets to take home for my family instead?') },
  { id: 'RC-R7b', rule: 'R7 改目标 goalChange', expect: 'goalChange object (another time), done false', ctx: base(office, 1, 'Sorry, can I come back tomorrow afternoon instead? I forgot my passport.', { history: historyUpTo(office, 1) }) },
  { id: 'RC-R3b', rule: 'R3 偏题拉回', expect: 'understood false, one short question back to the order', ctx: base(hawker, 0, 'My son goes to school near here.') },
  { id: 'RC-R3d', rule: 'R3 偏题拉回', expect: 'understood false, one short question back to the appointment', ctx: base(office, 1, 'The weather is so hot today. Do you like durian?', { history: historyUpTo(office, 1) }) },
  { id: 'RC-R8c', rule: 'R8 母语模式只有语气词', native: true, expect: 'understood false, suggestion null', ctx: base(hawker, 0, '嗯……那个……') },
  { id: 'RC-R8d', rule: 'R8 母语模式只有语气词', native: true, expect: 'understood false, suggestion null', ctx: base(office, 1, '呃……就是……那个……', { history: historyUpTo(office, 1) }) },
  { id: 'RC-R11b', rule: 'R11 最后一句即结束', expect: 'done true, short polite close, no new question', ctx: base(office, lastPair(office), 'Okay, thank you very much.', { history: historyUpTo(office, lastPair(office)) }) },
  { id: 'RC-R11c', rule: 'R11 最后一句即结束', expect: 'done true, short polite close, no new question', ctx: () => base(clinic, lastPair(clinic), 'Okay, I will tell you if I feel worse. Thank you.', { history: historyUpTo(clinic, lastPair(clinic)) }) },
  { id: 'RC-R1a', rule: '能懂时 coachNote 为空', expect: 'understood true, coachNote null', ctx: base(hawker, 0, 'One chicken rice, please.') },
  { id: 'RC-R2b', rule: '能懂时 coachNote 为空', expect: 'understood true, coachNote null', ctx: base(hawker, 0, 'Is the chicken rice spicy?') },
  { id: 'RC-R4b', rule: 'coachNote 建议说法不加引号（C12-2）', expect: 'one tip in Chinese; suggested wording unquoted so C12-2 keeps it', ctx: base(hawker, 1, 'Chili no want, chicken the steam.', { history: historyUpTo(hawker, 1) }) },
  { id: 'RC-R6b', rule: 'coachNote 建议说法不加引号（C12-2）', expect: 'one tip in Chinese; suggested wording unquoted so C12-2 keeps it', ctx: base(office, 1, 'Yes I have bring the passport and letter.', { history: historyUpTo(office, 1) }) },
];
// --round 2 re-runs the partner cases after the C15-2b fix (labels "RC2-"); the native suggest prompt was not changed.
// Both rounds share the one USD0.05 re-check budget.
const recheckOnly = args.includes('--recheck');
const round = args.includes('--round') ? Number(args[args.indexOf('--round') + 1]) : 1;
if (recheckOnly) { cases.length = 0; cases.push(...(round > 1 ? recheckCases.filter(c => !c.native).map(c => ({ ...c, id: c.id.replace('RC-', `RC${round}-`) })) : recheckCases)); }
const recheckSpent = () => ledger.entries(ITEM).filter(e => /^RC\d*-/.test(e.label)).reduce((sum, e) => sum + (e.status === 'settled' ? e.actual : e.reserved), 0);

const SOUND = /pronunc|accent|发音|發音|口音|発音|なまり|訛り|발음|억양|उच्चारण|लहजा|pelafalan|pengucapan|aksen|logat/i;
if (args.includes('--turns')) {
  const done = new Set(results.map(r => r.id));
  for (const c of cases) {
    if (done.has(c.id)) continue;
    const ctx = typeof c.ctx === 'function' ? c.ctx() : c.ctx;
    const estimate = JSON.stringify(ctx).length + 4500; // system prompt + schema overhead
    if (recheckOnly && recheckSpent() + responseReserve('gpt-4.1-mini', estimate, c.native ? 200 : 300) > RECHECK_BUDGET) { console.error('re-check budget reached'); break; }
    let r;
    try {
      r = c.native
        ? await paid(c.id, 'gpt-4.1-mini', 200, estimate, send => suggestInEnglish({ partnerLine: ctx.partnerLine, expectedLearnerLine: ctx.expectedLearnerLine, sceneLines: ctx.sceneLines, transcript: ctx.transcript, language: ctx.language, safety: ctx.safety }, { enabled: true, apiKey, fetch: send }))
        : await paid(c.id, 'gpt-4.1-mini', 300, estimate, send => respondInScene(ctx, { enabled: true, apiKey, fetch: send }));
    } catch (e) { console.error(String(e.message)); break; } // cap reached: stop
    const v = r.value;
    const product = v && !c.native ? {
      // What the turn service would keep (C12-2 quote check, sound filter, less-correction rule).
      coachNoteKept: typeof v.coachNote === 'string' && v.coachNote.trim() && !SOUND.test(v.coachNote) && !(ctx.correction === 'less' && v.understood) && quotesOnlyLearnerWords(v.coachNote, ctx.transcript) ? v.coachNote.trim() : null,
      quotesOk: typeof v.coachNote === 'string' ? quotesOnlyLearnerWords(v.coachNote, ctx.transcript) : null,
      soundJudgement: SOUND.test(`${v.reply} ${v.coachNote ?? ''}`),
      questionMarks: (v.reply.match(/\?/g) ?? []).length,
    } : v && c.native ? { contractOk: isNativeAnswer(v) } : null;
    record({ id: c.id, rule: c.rule, expect: c.expect, input: { transcript: ctx.transcript, partnerLine: ctx.partnerLine, correction: ctx.correction, focus: ctx.focus, goal: ctx.goal, safety: ctx.safety, language: ctx.language, historyTurns: ctx.history?.length ?? 0 }, answer: v ?? null, error: r.error ?? null, product, usage: r.call?.usage ?? null });
    console.log(c.id, JSON.stringify(v ?? r.error));
  }
}
console.log(`${ITEM} spent so far USD ${ledger.total(ITEM).toFixed(6)}`);
