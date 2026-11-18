# Pearl — launch voice lines v0.1

Status: **draft for baked TTS / Look Test; not final voice.**
Date: 2026-11-14
Rules: ≤40 Chinese characters per line; calm, concrete, non-coercive; no "主人/宝宝"; no "我只有你"; no guilt; no unverifiable claims.

Placeholders: `{who}`, `{what}`, `{due}` may only be filled from a valid `Pet Brief`. If no brief, use the generic line.

---

## 1. Morning

| ID | Line | Brief? | Tag |
|---|---|---|---|
| m01 | 早。今天有一件答应过的事。 | yes | idle |
| m02 | 早。先做哪件？ | no | idle |
| m03 | 天亮了。珍珠还亮着。 | yes | remind |

## 2. Work start

| ID | Line | Brief? | Tag |
|---|---|---|---|
| w01 | 你忙你的，我在。 | no | idle |
| w02 | 这件事还没关。 | yes | remind |
| w03 | 先做最靠近截止时间的那件。 | yes | remind |

## 3. Reminder

| ID | Line | Brief? | Tag |
|---|---|---|---|
| r01 | {who}的{what}，{due}到期。 | yes | remind |
| r02 | 珍珠亮了。{who}那件事还没发。 | yes | remind |
| r03 | 今天到期：{what}。 | yes | remind |
| r04 | 这件事拖了三天。要先处理吗？ | yes | remind |

## 4. Risk

| ID | Line | Brief? | Tag |
|---|---|---|---|
| k01 | 有一件高风险的事，还没动。 | yes | remind |
| k02 | 这个截止时间很近了。 | yes | remind |

## 5. Pat

| ID | Line | Brief? | Tag |
|---|---|---|---|
| p01 | 嗯。 | no | pat |
| p02 | 再摸一下也可以。 | no | pat |
| p03 | 我记得你。 | no | pat |
| p04 | 手有点凉。 | no | pat |

## 6. Drag

| ID | Line | Brief? | Tag |
|---|---|---|---|
| d01 | 放我下来。 | no | drag |
| d02 | 我自己会走。 | no | drag |
| d03 | 慢一点。 | no | drag |

## 7. Land

| ID | Line | Brief? | Tag |
|---|---|---|---|
| l01 | 站稳了。 | no | land |
| l02 | 这里可以。 | no | land |

## 8. Talk / listening

| ID | Line | Brief? | Tag |
|---|---|---|---|
| t01 | 我在听。 | no | talk |
| t02 | 再说一遍？ | no | talk |

## 9. Sleep

| ID | Line | Brief? | Tag |
|---|---|---|---|
| s01 | 灯留着。晚安。 | no | sleep |
| s02 | 明天再说。 | no | sleep |

## 10. Offwork

| ID | Line | Brief? | Tag |
|---|---|---|---|
| o01 | 今天到这里？ | no | idle |
| o02 | 剩下的明天再说。 | no | idle |

## 11. Completion

| ID | Line | Brief? | Tag |
|---|---|---|---|
| c01 | 这件关了。 | yes | happy |
| c02 | 可以休息一下。 | no | pleased |

## 12. Unknown

| ID | Line | Brief? | Tag |
|---|---|---|---|
| u01 | 这个我还不太懂。 | no | listening |
| u02 | 这个我没记。 | no | calm |

## 13. Weekend

| ID | Line | Brief? | Tag |
|---|---|---|---|
| e01 | 周末了。还要开电脑？ | no | idle |
| e02 | 今天不排事也可以。 | no | idle |

## 14. Late night

| ID | Line | Brief? | Tag |
|---|---|---|---|
| n01 | 很晚了。先睡？ | no | sleepy |
| n02 | 最后一件，做完就关。 | yes | remind |

## 15. Connection / error

| ID | Line | Brief? | Tag |
|---|---|---|---|
| x01 | 还没连上账本。 | no | calm |
| x02 | 账本暂时读不到。 | no | calm |

---

## 16. Banned lines (do not use)

- 主人，你回来了。
- 我一直在等你。
- 你不来我会难过。
- 我只有你。
- 不要离开我。
- 你答应过我的。
- 你今天还没陪我。
- 我是你的专属宠物。
- 我比你的朋友更懂你。
- 官方 DeepSeek 鲸鱼娘。

## 17. Voice recording notes

- Use DeepSeek TTS `stella`; `tide` fallback.
- One take per line; no emotional over-acting; calm and close-mic.
- Keep 0.2s silence at both ends; normalize to -16 LUFS.
- Subtitles always match the text exactly.
- Baked WAV manifest: id, text, file, duration, hash.
- Do not clone a real person or a known character.
