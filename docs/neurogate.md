# NeuroGate

## Актуальная линейка моделей

| Модель | Коэффициент |
| --- | ---: |
| DeepSeek v4 Flash | 0.2x |
| MiMo v2.5 | 0.2x |
| Qwen3.7 Plus | 0.8x |
| MiMo v2.5 Pro | 1x |
| MiniMax M3 | 1x |
| DeepSeek V4 Pro | 1x |
| GPT-5.4-mini | 1.2x |
| Kimi K2.6 | 2.8x |
| Qwen3.7 Max | 3.5x |
| GPT-5.4 | 3.5x |
| GLM-5.1 | 3.7x |
| GPT-5.5 | 5x |

## URL-ы

- Для OpenAI-compatible Chat Completions в Neurogate: `https://api.neurogate.space/v1`.
- Для Claude Code / Desktop IDE от Anthropic: `ANTHROPIC_BASE_URL=https://api.neurogate.space` — без `/v1`, потому что Claude Code добавляет `/v1` автоматически.

## Claude Code

Разовый запуск:

```bash
export ANTHROPIC_BASE_URL="https://api.neurogate.space"
export ANTHROPIC_API_KEY="xxxxx"
claude
```

```powershell
$env:ANTHROPIC_BASE_URL = "https://api.neurogate.space"
$env:ANTHROPIC_API_KEY = "xxxxx"
claude
```

Постоянный пример конфига лежит в `.claude/settings.example.json`. Для реального использования скопируйте его в `~/.claude/settings.json` и замените `xxxxx` на свой ключ. Реальный `settings.json` не должен попадать в git.
