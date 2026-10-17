# T63C · C3 真实语音对练（2026-10-17）

课程：小贩中心短课（任务 2bbcaffa，修订 4），辅助语言 zh-Hans，服务 `LES_LIVE_PRACTICE=1`、`LES_PRACTICE_MAX_MICROS=8000000`。学员语音用 OpenAI tts-1 合成英文（4 段，约 120 字符，约 USD0.002，不在账本内）；静音段用 ffmpeg anullsrc 生成 3 秒。

| # | 回合 | 输入 | HTTP | 耗时 | 结果 | 转写 | 对方回应 | 配音 |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | l1.wav | 200 | 3.0s | reply，听懂 | One Hainanese chicken rice, please. | Do you want chili sauce with that? | audio/wav 164KB |
| 2 | 1 | silence.wav | 200 | 0.3s | silence | — | — | — |
| 3 | 1 | l2.wav | 200 | 2.5s | reply，听懂 | Is the chili very spicy? Can you put less? | Yes, the chili is a little spicy. I will put less chili for you. | audio/wav 210KB |
| 4 | 2 | l3.wav | 200 | 3.0s | reply，听懂 | Iced Milo, please. | Good choice! Your order is one Hainanese chicken rice with less chili sauce and one iced Milo. Please pay $4.50 here. | audio/wav 419KB |
| 5 | 3 | l4.wav | 200 | 2.1s | reply，听懂 | Here you go. Thank you. | Thank you! Please wait here. Your food will be ready soon. | audio/wav 225KB |

5 轮全部 200：4 轮语音都正确转写、判定听懂并给出带配音的场景内回应，回应依次推进点餐流程；静音轮返回 `{kind:'silence'}` 不推进。无失败、无自动重试、无发音评分。

## 费用

- 对练账本 `practice_turns`：5 轮 × 预留 USD0.03 = **USD0.15**（上限 USD8）。
- 账本外：学员语音合成约 USD0.002。
