# Neurogate

Neurogate — настольный AI-клиент на Tauri 2 + React/TypeScript для Universal API Connector, multi-agent режимов, Planning Mode и безопасного Project Builder.

## Команды разработки

```bash
npm install
npm run dev
npm run build
npm run check
npm run tauri:dev
```

> На Windows используйте `npm run tauri:dev`: скрипт сам подключает Visual Studio Build Tools (`VsDevCmd.bat`), добавляет Rust/Cargo в `PATH` и запускает `tauri dev`.
> Dev-сервер Tauri настроен на `http://127.0.0.1:1420`, чтобы не конфликтовать с другими Vite-проектами на `5173`.

## Структура

- `src/` — React UI, Zustand state, frontend-слои providers/orchestrator/MCP/project builder.
- `src-tauri/` — Rust/Tauri команды, keychain vault, SQLite history, MCP registry, project builder.
- `design/` — эталонные standalone HTML-макеты и design tokens.
- `docs/neurogate.md` — актуальная линейка NeuroGate, коэффициенты и пример Claude Code config.
- `PLAN.md` — дорожная карта с отметками выполненных MVP-этапов.

## Безопасность

- API-ключи не сохраняются в frontend state как постоянные значения: backend-команда пишет секреты в OS keychain и возвращает ссылку `keychain://Neurogate/<provider>`.
- Project Builder требует явного подтверждения пользователя перед записью файлов.
- История сообщений хранится в SQLite в app data директории.
