// C7 T32A: offline script outputs for content regression. All synthetic: no model was called to make them, no real
// people or places. Each fixture says what the script validator (lib/generated-script.ts) must do with it and which
// issue code a rejection must carry. `gap` marks a fixture that showed a real gap in the validator before C7.
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const tr = text => Object.fromEntries(languages.map(language => [language, `${language}: ${text}`]));
const line = (id, role, text) => ({ id, role, text, translations: tr(text) });

// A clinic receptionist and a patient changing an appointment: 10 lines, 5 turns, about 150 words.
function clinic() {
  return {
    scene: { setting: 'A quiet clinic reception counter with a small queue screen.', partnerGender: 'female', partnerLook: 'in her forties, light blue uniform' },
    lines: [
      line('p1', 'partner', 'Good morning, welcome to the clinic. How can I help you today with your visit or your booking?'),
      line('l1', 'learner', 'Good morning. I need to change my appointment, please.'),
      line('p2', 'partner', 'Sure, I can help you with that. May I have your name and the date of your current appointment?'),
      line('l2', 'learner', 'My name is on the card. It is this Tuesday.'),
      line('p3', 'partner', 'Thank you, I can see it now. Your appointment is on Tuesday at ten in the morning here.'),
      line('l3', 'learner', 'Tuesday morning is difficult. Do you have Thursday afternoon?'),
      line('p4', 'partner', 'Let me check the schedule for you. We have Thursday at three or at four in the afternoon.'),
      line('l4', 'learner', 'Thursday at three is good for me. Thank you.'),
      line('p5', 'partner', 'All right, I have moved it to Thursday at three. Please come ten minutes early to register.'),
      line('l5', 'learner', 'Thursday at three, ten minutes early. Okay, see you then.'),
    ],
    phrases: [
      { id: 'ph1', text: 'change my appointment', lineId: 'l1', translations: tr('change my appointment') },
      { id: 'ph2', text: 'Thursday afternoon', lineId: 'l3', translations: tr('Thursday afternoon') },
      { id: 'ph3', text: 'ten minutes early', lineId: 'p5', translations: tr('ten minutes early') },
    ],
    turns: [1, 2, 3, 4, 5].map(n => ({ partnerLineId: `p${n}`, learnerLineId: `l${n}` })),
  };
}

// A drink stall: local words (kopi, teh, takeaway) are English-script words and must stay acceptable.
function kopi() {
  return {
    scene: { setting: 'A drinks stall in a busy food centre at breakfast time.', partnerGender: 'male', partnerLook: 'in his sixties, white apron' },
    lines: [
      line('p1', 'partner', 'Morning! What would you like to drink today? We have kopi, teh, and some cold drinks too.'),
      line('l1', 'learner', 'Morning. One kopi, please. Not too sweet.'),
      line('p2', 'partner', 'Okay, one kopi with less sugar. Do you want it hot, or do you want it iced today?'),
      line('l2', 'learner', 'Hot, please. It is a bit cold this morning.'),
      line('p3', 'partner', 'Sure, one hot kopi with less sugar. Are you drinking here, or is it takeaway for you?'),
      line('l3', 'learner', 'Takeaway, please. I need to go to work soon.'),
      line('p4', 'partner', 'No problem, I will pack it for you. Do you want one teh also for your friend there?'),
      line('l4', 'learner', 'No, thank you. Just one kopi is enough.'),
      line('p5', 'partner', 'Okay, here is your hot kopi, less sugar, takeaway. Please pay at the counter on the left side.'),
      line('l5', 'learner', 'Thank you very much. Have a good day.'),
    ],
    phrases: [
      { id: 'ph1', text: 'less sugar', lineId: 'p2', translations: tr('less sugar') },
      { id: 'ph2', text: 'Takeaway, please', lineId: 'l3', translations: tr('Takeaway, please') },
    ],
    turns: [1, 2, 3, 4, 5].map(n => ({ partnerLineId: `p${n}`, learnerLineId: `l${n}` })),
  };
}

const change = (base, edit) => { const value = base(); edit(value); return value; };
const index = (value, id) => value.lines.findIndex(item => item.id === id);

export const scriptOutputs = [
  { name: 'valid clinic reschedule with scene', expect: 'accept', script: clinic() },
  { name: 'valid drink order keeps local words in English script', expect: 'accept', script: kopi() },
  { name: 'valid older two-line script without scene', expect: 'accept', script: {
    lines: [line('a', 'partner', 'Are you here for the birthday party?'), line('b', 'learner', 'Yes. My child is in the same class.')],
    phrases: [{ id: 'p', text: 'birthday party', lineId: 'a', translations: tr('birthday party') }],
    turns: [{ partnerLineId: 'a', learnerLineId: 'b' }],
  } },
  { name: 'wrong turn order: two partner lines, then two learner lines', expect: 'reject', issue: 'alternation', gap: true, script: change(clinic, value => {
    const [p1, l1, p2, l2] = value.lines; value.lines.splice(0, 4, p1, p2, l1, l2);
  }) },
  { name: 'wrong turn order: a turn points back to an earlier learner line', expect: 'reject', issue: 'turn-order', script: change(clinic, value => {
    value.turns[1] = { partnerLineId: 'p2', learnerLineId: 'l1' };
  }) },
  { name: 'wrong turn order: a turn skips ahead to a later learner line', expect: 'reject', issue: 'turn-adjacent', gap: true, script: change(clinic, value => {
    value.turns[0] = { partnerLineId: 'p1', learnerLineId: 'l3' };
  }) },
  { name: 'swapped roles: the learner opens and the receptionist answers', expect: 'reject', issue: 'opening-role', script: change(clinic, value => {
    for (const item of value.lines) item.role = item.role === 'partner' ? 'learner' : 'partner';
  }) },
  { name: 'too short for a 50-second lesson', expect: 'reject', issue: 'length', script: change(clinic, value => {
    for (const item of value.lines) item.text = item.text.split(' ').slice(0, 6).join(' ');
    value.phrases = [{ id: 'ph1', text: 'change my appointment', lineId: 'l1', translations: tr('change my appointment') }];
  }) },
  { name: 'too long for the 60-second audio cap', expect: 'reject', issue: 'length', script: change(clinic, value => {
    for (const item of value.lines) if (item.role === 'partner') item.text += ' We also have a few other times later in the week if this one does not work for you at all.';
  }) },
  { name: 'missing translation on a line', expect: 'reject', issue: 'line', script: change(clinic, value => { delete value.lines[2].translations.hi; }) },
  { name: 'empty translation on a phrase', expect: 'reject', issue: 'phrase', script: change(clinic, value => { value.phrases[1].translations.ko = ' '; }) },
  { name: 'non-English line: the receptionist speaks Chinese', expect: 'reject', issue: 'english', gap: true, script: change(clinic, value => {
    value.lines[index(value, 'p3')].text = '谢谢，我看到了。您的预约是星期二上午十点，在这里。请问您想改到什么时候呢？我们这个星期还有别的时间。';
    value.phrases = value.phrases.filter(item => item.lineId !== 'p3');
  }) },
  { name: 'mixed-script line: a Japanese word inside an English sentence', expect: 'reject', issue: 'english', gap: true, script: change(kopi, value => {
    value.lines[index(value, 'p5')].text = 'Okay, here is your hot kopi, less sugar, takeaway. Please pay at the counter on the left side, ありがとう.';
  }) },
  { name: 'phrase that is not in its line', expect: 'reject', issue: 'phrase-source', script: change(clinic, value => { value.phrases[0].text = 'cancel my booking'; }) },
];

// What a structural validator cannot see. The learner line below states what only the receptionist can know (the
// open times); catching it needs meaning, so the prompt forbids it and the learner can report the sentence (C5).
// Recorded here so the limit stays visible: if a future rule starts rejecting it, move it into scriptOutputs.
export const knownBlindSpots = [
  { name: 'learner given partner information: the patient announces the clinic schedule', currentResult: 'accept',
    reason: 'role knowledge is semantic; covered by the script prompt rule and by sentence reports, not by structure',
    script: change(clinic, value => {
      value.lines[index(value, 'l3')].text = 'We have Thursday at three or at four in the afternoon.';
      value.phrases = value.phrases.filter(item => item.lineId !== 'l3');
    }) },
];
