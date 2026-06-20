# RamTeamAi

RamTeamAi — настольный AI-клиент на **Tauri 2 + React + TypeScript** для подключения разных AI API, сборки команды агентов, multi-agent планирования и безопасной подготовки файлов проекта перед записью на диск.

Проект задуман как локальный MVP универсального AI-оркестратора: один интерфейс для провайдеров, кастомных API, ролей агентов, топологий команды, диалога и build-артефакта.

## NeuroGate API и бонус

Проект пишется с поддержкой API **NeuroGate**. По приглашению можно получить **$5 на модели ИИ** с выгодными ценами и очень щедрыми лимитами:

[Получить бонус NeuroGate $5](https://portal.neurogate.space/invite?ref=Rerl3hyx81kZ3IRE)

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

## Возможности

- единый реестр провайдеров: Anthropic, OpenAI, Google Gemini, локальный Ollama, Neurogate и кастомные gateway/API;
- мастер кастомного API с настройкой Base URL, авторизации, шаблона тела запроса, JSONPath ответа и JSONPath streaming-чанка;
- Agent Builder: выбор провайдера, модели, роли, системного промпта, бюджета токенов и доступных инструментов;
- несколько топологий команды: Supervisor, Debate и Pipeline;
- Planning Mode: командное обсуждение задачи несколькими агентами с активными ролями и MCP/tool-use;
- экран решения/Build: редактируемый стек, шаги сборки, дерево проекта и подтверждение записи на диск;
- хранение секретов через OS keychain, а не в открытом виде во frontend state;
- GitHub Device Flow для входа, привязки проектов к репозиториям и Firebase-синхронизации настроек без диалогов и ключей.

## Скриншоты и описание экранов

## Релизы и обновления

### Таблица версий

| Версия | Дата | Что сделано | Артефакты |
| --- | --- | --- | --- |
| `0.1.3` | 2026-06-20 | Protected donation wallets via CODEOWNERS/GitHub Actions guard; added GitHub link, app version display in Settings, and non-draft GitHub releases for updater visibility. | Windows: [AppSetup.exe](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.3/AppSetup.exe) / [NSIS installer](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.3/RamTeamAi_0.1.3_x64-setup.exe); macOS: [DMG](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.3/RamTeamAi_0.1.3_universal.dmg); updater: [latest.json](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.3/latest.json) |
| `0.1.2` | 2026-06-18 | ????????? endpoint ??????????????; ???????? ??????????? updater artifacts (`latest.json` ? `.sig`) ??? Tauri updater. | Windows: [AppSetup.exe](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.2/AppSetup.exe) / [NSIS installer](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.2/RamTeamAi_0.1.2_x64-setup.exe); macOS: [DMG](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.2/RamTeamAi_0.1.2_universal.dmg); updater: [latest.json](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.2/latest.json) |
| `0.1.1` | 2026-06-18 | Обновлена desktop-сборка и опубликован релиз для Windows и macOS. | Windows: [AppSetup.exe](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.1/AppSetup.exe) / [NSIS installer](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.1/RamTeamAi_0.1.1_x64-setup.exe); macOS: [DMG](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.1/RamTeamAi_0.1.1_universal.dmg) |
| `0.1.0` | 2026-06-17 | Подготовлена desktop-сборка для Windows и macOS; добавлен Tauri updater; обновление запускается только после подтверждения пользователя; зафиксирован процесс релиза без Apple Developer ID/notarization. | Windows: [AppSetup.exe](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.0/AppSetup.exe) / [NSIS installer](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.0/RamTeamAi_0.1.0_x64-setup.exe); macOS: [DMG](https://github.com/korobprog/RamTeamAi/releases/download/v0.1.0/RamTeamAi_0.1.0_universal.dmg) |

- Windows публикуем как NSIS installer: `npm run release:windows`.
- macOS публикуем как DMG: `npm run release:mac`.
- Подготовлен новый релиз 0.1.3: синхронизированы версии проекта и заметки к сборке.
- Версию синхронизируем командой `npm run version:set -- 0.1.3`.
- Автообновления настроены через Tauri updater и GitHub Releases.

Подробный процесс: [`docs/release.md`](docs/release.md).

### Защита донат-кошельков

- Реквизиты доната вынесены в `src/config/donationWallets.ts`.
- Файл защищён через `.github/CODEOWNERS`: изменения должны проходить через владельца `@korobprog`.
- Workflow `.github/workflows/protect-donation-wallets.yml` блокирует PR с изменениями кошельков от не-владельца.
- На GitHub включена branch protection для `main`: обязательный Pull Request, Code Owner Review, устаревание review после новых коммитов и запрет force-push/delete.

### Версия и проверка обновлений

- Текущая версия приложения берётся из `package.json` и показывается в настройках.
- Tauri updater проверяет `https://github.com/korobprog/RamTeamAi/releases/latest/download/latest.json`.
- GitHub Actions публикует release не как draft, чтобы `/releases/latest/` сразу указывал на новую версию.
- Если в GitHub Releases опубликован `latest.json` с версией выше установленной, приложение показывает уведомление с новой версией и кнопкой обновления.

### 1. Стартовый экран

![Стартовый экран RamTeamAi](assets/screenshots/01-start.png)

Стартовый экран показывает основной сценарий работы: подключить API, собрать команду и запустить Planning Mode. Это не просто чат с одной моделью, а пошаговый вход в настройку AI-команды.

### 2. Провайдеры

![Провайдеры RamTeamAi](assets/screenshots/02-providers.png)

Экран провайдеров — единый реестр API, моделей и capability-флагов. Здесь видно статус подключения, количество моделей и возможность тестировать провайдера. Секреты маскируются, а реальные ключи должны храниться в OS keychain.

### 3. Настройки программы

![Настройки программы](assets/screenshots/02-settings.png)

Экран настроек собирает в одном месте GitHub/Firebase-синхронизацию, привязку проекта к репозиторию и быстрые переходы к основным разделам приложения. Это удобная точка управления локальным состоянием, облачной синхронизацией и рабочей папкой для Build-сценария.

### 4. MCP-сервисы

![MCP-сервисы](assets/screenshots/03-mcp.png)

Экран MCP позволяет подключать внешние серверы инструментов через `stdio` или Streamable HTTP, обновлять список доступных tools и вызывать их вручную с JSON-аргументами. Это связывает Planning Mode не только с моделями, но и с внешними возможностями: web search, filesystem, локальные утилиты и другие MCP-интеграции.

### 5. Кастомный API

![Мастер кастомного API](assets/screenshots/03-custom-api.png)

Мастер кастомного API позволяет подключать не только заранее поддержанные сервисы, но и собственный LLM Gateway. Настраиваются URL, тип авторизации, streaming-режим, шаблон тела запроса, JSONPath основного ответа и JSONPath чанков для стриминга.

### 6. Agent Builder

![Agent Builder](assets/screenshots/04-agent-builder.png)

Agent Builder собирает отдельного агента: провайдер, модель, роль, бюджет токенов, системный промпт и инструменты. Это позволяет создавать специализированных участников команды — например архитектора, критика или исследователя.

### 7. Топология команды

![Топология команды](assets/screenshots/05-topology.png)

Экран топологии выбирает способ взаимодействия агентов:

- **Supervisor** — главный агент делегирует подзадачи;
- **Debate** — агенты спорят, критикуют и сходятся к консенсусу;
- **Pipeline** — выход одного агента становится входом следующего.

Дополнительно задаются лимит раундов и арбитр, который помогает завершить обсуждение решением.

### 8. Диалог / Planning Mode

![Диалог и Planning Mode](assets/screenshots/06-dialog.png)

Planning Mode показывает сессии, реплики агентов, активную команду и доступные MCP-инструменты. В отличие от обычного AI-чата, пользователь видит не только ответ модели, но и распределение ролей, состояние агентов, tool-use и переход от обсуждения к решению.

### 9. Решение → Build

![Решение и Build](assets/screenshots/07-solution-build.png)

Экран Build превращает результат команды в редактируемый артефакт: стек, список шагов, дерево проекта и список файлов. Перед записью на диск требуется явное подтверждение — это снижает риск случайной перезаписи проекта.

## Чем RamTeamAi отличается от похожих программ

- **Не один чат, а команда агентов.** Neurogate фокусируется на ролях, топологии и командном планировании, а не только на переписке с одной моделью.
- **Провайдер-независимость.** В одном интерфейсе можно держать OpenAI/Anthropic/Gemini/Ollama/кастомные API и приводить их ответы к общему формату.
- **Кастомные API без переписывания кода.** JSONPath и шаблон тела запроса позволяют подключать совместимые и нестандартные LLM gateway.
- **Planning Mode перед Build.** Сначала команда обсуждает архитектуру и план, затем результат превращается в build-артефакт.
- **Безопасный Project Builder.** Запись файлов отделена от планирования и требует подтверждения пользователя.
- **Локальное desktop-приложение.** Tauri дает нативное окно и доступ к системным возможностям, при этом frontend остается на React/TypeScript.
- **MCP/tool-use как часть модели агентов.** Инструменты назначаются агентам через capability-флаги, а не существуют отдельно от командного процесса.

## Как запустить проект на Tauri

### GitHub + Firebase sync

Для облачной синхронизации настроек скопируйте `.env.example` в `.env.local` и заполните `VITE_GITHUB_CLIENT_ID` и `VITE_FIREBASE_*`.

Синхронизация отправляет только настройки, агентов, провайдеры без ключей и GitHub-связи проектов. Диалоги, API-ключи и GitHub token не отправляются. Подробнее: [`docs/firebase-sync.md`](docs/firebase-sync.md).

### Требования

Для Windows нужны:

1. **Node.js LTS** и npm.
2. **Rust** через `rustup`.
3. **Microsoft Visual Studio Build Tools** с компонентами C++ build tools.
4. **WebView2 Runtime** — обычно уже установлен в Windows 10/11.
5. Установленные зависимости проекта через `npm install`.

### Установка зависимостей

```bash
npm install
```

### Запуск web-версии для разработки

```bash
npm run dev
```

Vite dev server используется frontend-частью. В конфигурации Tauri проект ориентирован на локальный dev-сервер `http://127.0.0.1:1420`, чтобы не конфликтовать с другими Vite-проектами на стандартном порту `5173`.

### Запуск desktop-приложения Tauri

```bash
npm run tauri:dev
```

На Windows этот скрипт запускает `scripts\tauri-dev.bat`, который подготавливает окружение Visual Studio Build Tools, добавляет Rust/Cargo в `PATH` и вызывает `tauri dev`.

Если окружение уже настроено вручную, можно также использовать:

```bash
npm run tauri -- dev
```

или напрямую:

```bash
npx tauri dev
```

### Проверка типов и сборка frontend

```bash
npm run check
npm run build
```

### Production-сборка Tauri

```bash
npx tauri build
```

Готовые артефакты Tauri будут созданы в директории `src-tauri/target/release/bundle/`.

## Структура проекта

- `src/` — React UI, Zustand state, frontend-слои providers/orchestrator/MCP/project builder.
- `src-tauri/` — Rust/Tauri команды, keychain vault, SQLite history, MCP registry, project builder.
- `assets/screenshots/` — скриншоты для README.
- `design/` — эталонные standalone HTML-макеты и design tokens.
- `docs/neurogate.md` — актуальная линейка NeuroGate, коэффициенты и пример Claude Code config.
- `PLAN.md` — дорожная карта с отметками выполненных MVP-этапов.

## Команды разработки

```bash
npm install        # установить зависимости
npm run dev        # запустить Vite frontend
npm run check      # проверить TypeScript без сборки
npm run build      # собрать frontend
npm run tauri:dev  # запустить Tauri desktop в dev-режиме
npx tauri build    # собрать desktop-приложение
```

## Подключение MCP-сервисов

Экран **MCP** позволяет добавлять внешние MCP-серверы:

- `stdio` — команда запуска сервера, например `npx -y @modelcontextprotocol/server-filesystem .`;
- `http` — URL Streamable HTTP endpoint, например `http://localhost:3000/mcp`.

После сохранения нажмите **«Подключить / обновить tools»** — приложение выполнит MCP `initialize`, получит `tools/list` и сохранит список инструментов в локальном реестре. На этом же экране можно вручную вызвать `tools/call` с JSON-аргументами для проверки сервиса.

## Безопасность

- API-ключи не должны сохраняться в frontend state как постоянные значения: backend-команда пишет секреты в OS keychain и возвращает ссылку вида `keychain://Neurogate/<provider>`.
- Project Builder требует явного подтверждения пользователя перед записью файлов.
- История сообщений хранится в SQLite в app data директории.
- Не коммитьте реальные ключи, `.env` с секретами, приватные сертификаты и локальные конфиги.
