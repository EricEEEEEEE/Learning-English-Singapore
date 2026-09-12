# T02 test contract

Reference: tasks T02 and F1.1, F4.5, F13.1–F13.3, F15.3; spec §6.5 full respect
statement. D02's proposed Chinese/Indonesian/Japanese/English interfaces remain
experimental and unreviewed. Translated labels in these tests are prototype UI
choices, not proof of language quality or additional product requirements.

New checks: language selection before login; four localized login/help/voice
states and reload persistence; changing language; larger text/reduced motion;
unavailable local storage reads and writes; persistent Tab/Space/Enter/tap regression
from T01. Ten cases × three viewports = 30 additions; with T01's 12, the suite contains 42.

The 15% font-size increase is a falsifiable engineering criterion for the user's
large-text choice, not a numeric requirement claimed to come from the spec.
Subtitle collapse is exercised when T05/T06 add the media surface; no empty
subtitle toggle or pretend media is required in T02. All HTTP/WebSocket requests
outside the local origin, microphone requests and browser-TTS attempts fail.

Buttons for both providers are available in every selected language. Clicking
them must leave the person at the login screen with an honest, localized
not-connected message. No fake successful sign-in, tokens or real OAuth flow.
The voice-explanation control must clearly show it is unavailable, rather than
playing a substitute voice. Real login and reviewed audio remain T07/T08 work.

These tests inspect user-visible UI and reload behavior; they do not prescribe a
storage key, routing library, component hierarchy or provider implementation.
They use Chrome touch/viewport emulation, not physical iOS/Android devices.

Pre-archive review strengthened the account group to exactly two actions, added
localized negative assertions for successful sign-in/account state, and covered
both button and link labels for excluded reading/writing courses in all four
languages. Large text is checked on heading, body copy and provider button.
The large-text layout check is still Chinese-only; other languages require
supplementary visual review. Respect text does not certify real accent handling.
