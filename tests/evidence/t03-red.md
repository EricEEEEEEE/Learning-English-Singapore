# T03 red evidence

Implementation baseline: T02 green `64c8ad4baa6a89d6bd4617a02665ecc789932272`,
confirmed by a real Stop receipt. Current phase: test-writing. App, dependencies,
spec, rules and hooks have not changed in this phase.

Final collection: **102 cases in 5 files**, exit 0 (`t03-collection.log`):
42 original browser regressions + 15 T02 boundary cases + 39 T03 browser cases
+ 6 T03 deterministic-state cases. Browser cases keep the original 3 viewport
projects; domain cases run once. A collected case is not a passed case.

Targeted real red run:

`npm --prefix tests test -- --project=phone --project=domain --grep 'separate demo entry|core and optional paths'`

Exit 1, two failures (`t03-red.log`): the phone entry lacks the
“预览逐题引导” button; the deterministic-state module `lib/onboarding.ts` does
not yet exist. The page loaded successfully. Browser/context evidence is in
`t03-red-phone.png`, `t03-red-phone-context.md`, and `t03-red-domain-context.md`.
The subsequently strengthened tests did not change either executed target.
The other 43 new T03 cases were collected but not executed yet.

Existing/boundary regression run:

`npm --prefix tests test -- t01-local-entry.spec.mjs t02-language-login.spec.mjs t02-boundaries.spec.mjs`

Exit 1, **45 passed / 12 failed**, 57 executed (`t03-existing-regressions.log`).
All 42 original cases and three temporary-write-recovery cases passed. The 12
large-text/language-switch cases reach the English reload title assertion and
fail: the visible page stays English but the browser title becomes the static
Chinese title. This is a newly exposed T02 defect, not a relaxed assertion.
Representative title-refresh screenshots and contexts are saved at all three
widths. Fix it within the authorized B1 implementation after this red receipt;
full green requires all 102 cases, including these 12, to pass.

The first attempt to select only regressions used `--grep-invert '^T03'`.
Playwright matches a complete title including the file/project, so that pattern
incorrectly included unimplemented T03 cases. The run was interrupted (exit 130)
and retained as `t03-selection-interrupted.log`. It is not a passing result and
was superseded by the explicit three-file run above. No test was skipped or
weakened to compensate.

Independent test-design review found two potential false positives: comparing
aliased state references, and counting one object key to infer no duplicates.
The final tests use pre-action deep snapshots and compare complete key sets and
unrelated records. Review found those fixes acceptable; four-language completion
and optional paths were subsequently checked for consistency. The near-zero
path's L0/L1 metadata limit still needs actual content/visual review in green.
Native-speaker review, real sound, device and adult usability calibration are
not claimed. T03 green must also retain an interaction recording and screenshots.
