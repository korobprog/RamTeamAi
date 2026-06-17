# RamTeamAi

## Линейка моделей и формат API

| Модель | Формат API | Коэффициент |
| --- | --- | ---: |
| DeepSeek v4 Flash | Chat Completions API | 0.2x |
| MiMo v2.5 | Chat Completions API | 0.2x |
| Qwen3.7 Plus | Anthropic API | 0.8x |
| MiMo v2.5 Pro | Chat Completions API | 1x |
| MiniMax M3 | Anthropic API | 1x |
| DeepSeek V4 Pro | Chat Completions API | 1x |
| GPT-5.4-mini | Responses API | 1.2x |
| Kimi K2.6 | Chat Completions API | 2.8x |
| Qwen3.7 Max | Anthropic API | 3.5x |
| GPT-5.4 | Responses API | 3.5x |
| GLM-5.1 | Chat Completions API | 3.7x |
| GPT-5.5 | Responses API | 5x |

## URL и маршрутизация

Встроенный провайдер RamTeamAi в приложении использует общий Base URL:

```text
https://api.RamTeamAi.space/v1
```

Адаптер выбирает endpoint по выбранной модели:

- Chat Completions API → `POST /chat/completions`
- Anthropic API → `POST /messages`
- Responses API → `POST /responses`

Для Responses API приложение отправляет `store: false`, чтобы не требовать серверного хранения ответа.

## Claude Code / Anthropic-compatible клиенты

Для Claude Code / Desktop IDE от Anthropic обычно указывают base URL без `/v1`, потому что клиент Anthropic добавляет `/v1` сам:

```bash
export ANTHROPIC_BASE_URL="https://api.RamTeamAi.space"
export ANTHROPIC_API_KEY="xxxxx"
claude
```

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.RamTeamAi.space"
$env:ANTHROPIC_API_KEY = "xxxxx"
claude
```

Постоянный пример конфига лежит в `.claude/settings.example.json`. Для реального использования скопируйте его в `~/.claude/settings.json` и замените `xxxxx` на свой ключ. Реальный `settings.json` не должен попадать в git.
