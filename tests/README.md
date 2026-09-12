# Offline prototype checks

T01 covers the local-entry subset of F13.1 and F15.1, plus the task's explicit
demo disclosure and offline requirements. It does not certify the full learning
flow, auxiliary-language coverage, real phone browsers, OAuth, speech or video.

Prerequisites: Node 24, npm, and Google Chrome installed locally. The test runner
is an independent, version-locked package under `tests/` so the red archive does
not require application implementation. No paid model service is used.

After the application is implemented, run from the project root:

```sh
npm ci
npm --prefix tests ci
bash .loopwork/hooks/verify.sh
```

`tests/run.sh` requires type checking and a production build to succeed before
running every browser spec in `tests/e2e/`. A failed command is fatal. Playwright
starts and stops its own local server on `127.0.0.1:3210`; it refuses to reuse an
existing process, so tests cannot accidentally pass against an older app.

Four behavior checks run at 320×740, 390×844 and 1280×800 (12 cases). The 44px
touch-target check is an engineering criterion for F13.1, not a claim that the
specification named that size. The “演示说明” disclosure is a local UI choice for
T01's required honest demo marker, not a substitute for T02–T06.

External HTTP and WebSocket attempts fail the tests. Service workers are blocked;
microphone/camera attempts are intercepted and fail the entry checks. This proves
the exercised browser path makes no external requests, not that future backend
code has passed an outbound-network audit. No fake provider responses are used.

The first test saves `entry.png` per viewport under ignored `test-results/`.
Failures retain a screenshot and trace there. These are browser-emulation
artifacts, not evidence of iOS Safari or Android Chrome support.

Sources checked when authoring: [Playwright configuration](https://playwright.dev/docs/test-configuration),
[local web server](https://playwright.dev/docs/test-webserver), and
[network interception](https://playwright.dev/docs/network).
