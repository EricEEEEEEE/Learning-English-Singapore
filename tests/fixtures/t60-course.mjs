const translations = text => Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(code => [code, `${code}: ${text}`]));
export function courseFixture() {
  return {
    id: 'synthetic-test-course', version: 'revision-2', source: 'test-fixture',
    media: { src: '/media/hotel-pov-12s.mp4', duration: 12.042, version: 'revision-2' },
    lines: [
      { id: 'a', role: 'partner', text: 'Good morning. Are you ready?', start: 3, end: 4.2, version: 'revision-2', translations: translations('greeting') },
      { id: 'b', role: 'learner', text: 'Yes. I am ready.', start: 8, end: 9.2, version: 'revision-2', translations: translations('answer') },
    ],
    phrases: [{ id: 'p', text: 'ready', lineId: 'b', translations: translations('ready') }],
    turns: [{ partnerLineId: 'a', learnerLineId: 'b' }],
  };
}
