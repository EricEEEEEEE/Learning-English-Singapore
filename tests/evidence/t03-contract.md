# T03 contract: one question at a time, with honest prototype evidence

References: tasks T03; F2.1–F2.3, F5.2, F13.1; spec §6.1–6.2.
T02 green receipt `64c8ad4baa` is the implementation baseline.

The prototype has 12 core questions (5 preferences and 7 listening/image flow
items) and at most 4 optional questions. This is within the spec's 10–14 core,
4–6 preferences, 6–8 listening and 4 optional limits, not a calibrated assessment.
Self-report only changes the entry path; it is not measured ability. A near-zero
choice must not require reading/typing English, speaking, or harder listening.

Only one current-question article is visible. Its answer group has 2–4 choices;
unknown and skip are separate controls. An answer or skip advances; back, pause,
resume and finish remain available. Finishing shows an unknown/provisional entry
message and unobserved speaking, not a score, CEFR certificate or demonstrated
mastery. Real placement rules are T04 work.

A separate, explicitly labelled demo entry sits outside the two account actions.
It never changes authentication state. Real instruction/question/answer audio
remains unavailable. Expandable demo controls can report a simulated playback
ending, full-answer ending or playback failure; the simulation label is permanent.
No audio is played, no microphone is requested, and no browser TTS is allowed.
No simulated event can be promoted to actual listening evidence.
The near-zero path's seven listening items stay within foundation content bands
L0/L1. The bands describe planned content, not the learner; actual difficulty and
image meaning still require implementation review and later real calibration.

The domain module `lib/onboarding.ts` exposes createOnboardingSession,
getCurrentQuestion and applyOnboardingEvent. This is a proposed deterministic
state boundary for T03/T04. Events and persisted records are tested through that
boundary, independent of React layout or local-storage keys. UI persistence tests
prove the state is wired into the actual app.

Per-question record contract: firstChoiceId, latestChoiceId, response
(choice/unknown/skipped), promptPlayCount, replayCount, answerExposed,
deviceFailure and evidenceSource ('simulation'). Records are keyed by question
ID, not appended each time the user revisits. A simulated full-answer event
retains support history; replay count and first choice cannot be erased by back,
changed answers, pauses or serialization. Device failure is retained separately
from unknown/skipped. This task does not turn those records into real ability.
The first-choice snapshot also retains firstChoiceHadAnswer,
firstChoicePromptPlayed and firstChoiceDeviceFailure, distinguishing help before
the first response from help requested afterward. Later actions cannot rewrite
what support was present at that first response.

The browser cases cover all four experimental languages; no language is claimed
reviewed. Each language reaches core completion and the optional cap as well as
listening help and pause/resume. The domain cases run once under a separate Playwright project; the
existing 42 cases retain their three original viewport projects and assertions.
T02's recovery/title/large-text exploratory checks are promoted into additional
regressions in this test-writing phase without changing the frozen T02 file.
