# T02 red evidence

Application baseline: `05e3a17e8c21addd8e54d95b8542af71d5985380` (T01 green receipt verified).
Application, package/lock/config, spec, rules and the existing T01 test file were
not changed in this test-writing round.

Final collection: 42 cases, 30 new + 12 existing. The targeted real-browser probe:

```sh
npm --prefix tests test -- t02-language-login.spec.mjs --project=phone --grep 'language choice comes before either login option'
```

Result: **exit 1, one failed**. The T01 page opened successfully, but
`getByRole('button', { name: /^简体中文/ })` did not find a visible language choice.
The failure is a browser assertion about the missing T02 entry, not an absent
runtime or test dependency. Full log, screenshot and context are `t02-red.log`,
`t02-red.png` and `t02-red-context.md` beside this file.

The added T01 keyboard/touch regression also ran at all three widths:
**exit 0, 3 passed** (`t02-keyboard-regression.log`). Its body was unchanged by
the subsequent review additions. This round did not execute all 42 cases;
unimplemented login/language assertions must still pass in the green round.

Read-only pre-archive review by `/root/t01_review`: two initial gaps were fixed
(exactly two account actions and no fake success, four-language button/link
exclusions for reading/writing courses). Heading/body/button scaling and storage
read/write failure checks were added. Final static verdict: no blocking findings,
eligible for red archive. Translation quality, non-Chinese large-text layouts and
real accent handling remain outside this automatic evidence.

Current objective remains B1 T01–T06. Red/green handoffs are intermediate steps;
implementation starts only after the real Stop red receipt. No batch flag,
provider calls, OAuth, publication or rule changes were introduced.
