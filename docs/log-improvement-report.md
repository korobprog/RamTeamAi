# Log Improvement Report

Дата проверки: 2026-06-18 19:27 local
Репозиторий: `C:\Users\makst\Documents\RAM`

## Статус на момент проверки

Проект ещё может быть в работе: найдены живые процессы `tauri:dev`, `vite`, `cargo run`, `RamTeamAi.exe` и `tauri build --bundles nsis`. При этом локальные лог-файлы в корне давно не обновлялись:

- `tauri-dev-run.out.log` — последнее изменение 2026-06-18 02:31:59
- `tauri-dev-run.err.log` — последнее изменение 2026-06-18 02:24:32
- `tauri-direct.log` — последнее изменение 2026-06-17 01:11:50
- `vite.log` — последнее изменение 2026-06-17 00:17:27

Текущие быстрые проверки проходят:

```text
npm run check        OK
npm test             OK, 4 files / 21 tests
npm run build        OK, Vite build completed
cargo check          OK, но есть 2 warning
```

Vite production build дополнительно предупреждает, что JS chunk больше 500 kB.

## Краткий прошлый отчёт

Предыдущий анализ логов показал:

1. Старые ошибки сборки, вероятно, уже исправлены:
   - `loadProviderOverrides is not defined`
   - missing `/src/orchestrator/index.ts`
   - missing `/src/projectBuilder/index.ts`
   - Rust errors: `missing field api_format`, missing modules `mcp/project_builder`, wrong args.
2. Осталась актуальная React-проблема с duplicate key:
   - `Encountered two children with the same key, Разработчикcoder`
3. Остались Rust naming warnings:
   - crate `RamTeamAi_lib` should have a snake case name
   - function `RamTeamAi_requires_stream` should have a snake case name
4. CSS warning про порядок `@import` уже исправлен: сейчас imports стоят в начале `src/styles.css`.
5. Warning Fast Refresh по `RoleBadge.tsx` можно улучшить позже, вынеся helper/export из component-файла.

## Что найдено в логах

### 1. React duplicate key в списке задач агентам

Лог: `tauri-dev-run.err.log`

```text
Encountered two children with the same key, `Разработчикcoder`.
Keys should be unique so that components maintain their identity across updates.
```

Вероятное место:

- `C:\Users\makst\Documents\RAM\src\screens\BuildScreen.tsx`
- блок `assignments.map(...)`
- текущий ключ: `key={item.owner + item.role}`

Почему это происходит:

- если в команде есть два агента с одинаковым именем и ролью, например два `Разработчик`/`coder`, ключ становится одинаковым;
- React может неверно переиспользовать DOM-узлы, дублировать/пропускать элементы и странно обновлять UI.

Как исправить:

1. Добавить стабильный id в `ImplementationAssignment`:

```ts
export interface ImplementationAssignment {
  id: string;
  role: AgentRole;
  owner: string;
  summary: string;
  deliverables: string[];
}
```

2. В `planImplementationAssignments(...)` возвращать `id: agent.id`.
3. В `BuildScreen.tsx` заменить:

```tsx
key={item.owner + item.role}
```

на:

```tsx
key={item.id}
```

4. Добавить/обновить тест, который создаёт двух агентов с одинаковыми `name` и `role`, но разными `id`, и проверяет уникальность assignment ids.

Приоритет: высокий, потому что это актуальная ошибка runtime UI.

### 2. Rust naming warnings

Команда `cargo check` сейчас проходит, но выдаёт:

```text
warning: crate `RamTeamAi_lib` should have a snake case name
warning: function `RamTeamAi_requires_stream` should have a snake case name
```

Файлы:

- `C:\Users\makst\Documents\RAM\src-tauri\Cargo.toml`
- `C:\Users\makst\Documents\RAM\src-tauri\src\core\provider.rs`

Как исправить:

1. В `src-tauri/Cargo.toml` проверить, можно ли безопасно заменить:

```toml
[lib]
name = "RamTeamAi_lib"
```

на:

```toml
[lib]
name = "ram_team_ai_lib"
```

2. В `src-tauri/src/core/provider.rs` переименовать функцию:

```rust
fn RamTeamAi_requires_stream(...)
```

в:

```rust
fn ram_team_ai_requires_stream(...)
```

и обновить все вызовы.

3. После правки запустить:

```text
cargo check
npm run tauri:build
```

Приоритет: средний. Это не ломает сборку, но лучше держать backend без warning.

### 3. Временные ошибки импортов во время работы агентов

Логи `vite.log` и `tauri-direct.log` содержали:

```text
ReferenceError: loadProviderOverrides is not defined
Failed to load url /src/orchestrator/index.ts
Failed to load url /src/projectBuilder/index.ts
Failed to load url /src/screens/ChatScreen.tsx
Failed to load url /src/screens/BuildScreen.tsx
```

Текущее состояние:

- `npm run check` проходит;
- `npm run build` проходит;
- указанные файлы уже существуют;
- значит эти ошибки, вероятно, были временными во время переименования/создания файлов агентами.

Как улучшить процесс:

1. Агентам лучше создавать новый файл до обновления импортов в существующих файлах.
2. При крупных переносах использовать порядок:
   - создать новый файл;
   - экспортировать API;
   - обновить импорты;
   - удалить старый файл;
   - сразу запустить `npm run check`.
3. Для проектных генераторов добавить тесты на наличие файлов, которые перечислены в `projectTree`/`APP_BUILD_FILES`.

Приоритет: низкий/процессный, если сейчас не воспроизводится.

### 4. Старые Rust compile errors уже не воспроизводятся

В `tauri-direct.log` были ошибки:

```text
error[E0063]: missing field `api_format` in initializer of `ModelConfig`
error[E0583]: file not found for module `project_builder`
error[E0061]: this function takes 4 arguments but 3 arguments were supplied
error[E0583]: file not found for module `mcp`
error[E0432]: unresolved import `tokio::process`
error[E0432]: unresolved imports `execute_mcp_tool`, `test_mcp_server_connection`
```

Текущее состояние:

- `cargo check` проходит;
- значит ошибки исправлены или были промежуточными.

Что всё равно стоит сделать:

1. Добавить CI/локальный скрипт, который гоняет вместе:

```text
npm run check
npm test
npm run build
cargo check
```

2. Перед слиянием агентских изменений запускать этот набор обязательно.

### 5. CSS `@import` warning уже исправлен

В старом `vite.log` было:

```text
[vite:css][postcss] @import must precede all other statements
```

Сейчас в `src/styles.css` imports стоят первыми:

```css
@import url("../design/theme.css");
@import "tailwindcss";
```

Действий не требуется.

### 6. Vite Fast Refresh warning по `RoleBadge.tsx`

В старом `vite.log` было:

```text
Could not Fast Refresh ("roleLabel" export is incompatible)
```

Файл:

- `C:\Users\makst\Documents\RAM\src\components\RoleBadge.tsx`

Причина:

- файл экспортирует React-компонент `RoleBadge` и обычную функцию `roleLabel`;
- для Fast Refresh лучше держать component-only exports.

Как исправить:

1. Создать, например, `src/lib/roles.ts` или `src/components/roleLabels.ts`.
2. Перенести туда `labels` и `roleLabel`.
3. В `RoleBadge.tsx` оставить только компонент.
4. Обновить импорты в:
   - `src/components/DebateSummary.tsx`
   - `src/components/TeamThinking.tsx`
   - `src/screens/AgentBuilderScreen.tsx`
   - `src/screens/ChatScreen.tsx`

Приоритет: низкий. Это dev-experience warning, не production bug.

### 7. Production bundle больше 500 kB

`npm run build` проходит, но Vite пишет:

```text
Some chunks are larger than 500 kB after minification.
```

Вероятные причины:

- всё приложение собирается в один большой entry chunk;
- возможно, тяжёлые экраны/интеграции импортируются eagerly.

Как исправить позже:

1. Разделить редкие экраны через `React.lazy`/dynamic import:
   - settings;
   - provider monitor;
   - build/topology screens;
   - firebase/cloud sync, если есть тяжёлые зависимости.
2. Посмотреть bundle analyzer или `vite build --debug`.
3. Если это ожидаемо для desktop-приложения, можно временно поднять `chunkSizeWarningLimit`, но лучше сначала сделать code splitting.

Приоритет: низкий/средний, зависит от скорости запуска приложения.

### 8. Логи разработки не обновляются, хотя процессы живы

Найдены живые процессы:

- `npm run tauri:dev`
- `tauri dev`
- `vite --host 127.0.0.1 --port 1420 --strictPort`
- `cargo run --no-default-features --color always --`
- `RamTeamAi.exe`
- `tauri build --bundles nsis`

Но файлы `tauri-dev-run.*.log` давно не пишутся.

Как улучшить:

1. Сделать единый скрипт логирования, например `scripts/dev-with-logs.ps1`, который пишет stdout/stderr в `logs/dev/YYYY-MM-DD-HH-mm-ss.*.log`.
2. Добавить ротацию/очистку старых логов.
3. В отчётах фиксировать точное время запуска и PID процессов.
4. Для build/release добавить отдельный лог:

```text
logs/build/tauri-build-YYYY-MM-DD-HH-mm-ss.log
```

Приоритет: средний, потому что сейчас трудно понять, что происходит после 02:31.

### 9. Агент может отпасть, но реализация не должна останавливаться

По скриншотам видно, что supervisor уже пытается подхватывать задачи после
таймаута: появляются записи `Агент заменён` и `recovered from ...`. Это правильное
направление, но поведение нужно сделать строгим правилом продукта, а не случайным
fallback.

Проблема:

- если архитектор/кодер/тестировщик не ответил, завис, вернул пустой ответ или
  неполный файл, текущий раунд не должен останавливаться;
- нельзя постоянно навешивать всё на одного и того же агента, иначе команда
  деградирует до одиночного исполнителя;
- пользователь должен видеть понятный отчёт, что произошло.

Как должно работать:

1. Supervisor ставит таймаут на задачу агента и проверяет качество результата:
   файл существует, содержимое полное, есть нужный путь, результат соответствует
   ожидаемому типу проекта.
2. Если агент сорвал задачу, он помечается как `fired`/`уволен` для этого раунда.
3. Система ищет замену:
   - сначала агент той же роли;
   - затем агент похожей специализации;
   - затем универсальный coder/implementer с подходящим рейтингом, контекстом,
     скоростью и доступным бюджетом.
4. Новый агент получает исходную задачу, уже написанные файлы и причину провала.
5. В пользовательском отчёте писать живым языком:
   - `Разработчик уволен: не ответил за 90 секунд`;
   - `Нанят Разработчик-2: забрал landing/index.html`;
   - `Архитектор уволен: вернул неполный план`;
   - `Нанят универсальный coder: продолжил Tauri scaffold`.
6. В техническом checkpoint сохранять:
   - старый агент;
   - новый агент;
   - причина замены;
   - файл/задача;
   - статус `recovered`, `partial` или `failed`;
   - сколько попыток замены уже было.
7. Если замены закончились, раунд должен завершиться как `partial`, но не зависать:
   пользователь получает список недоделанных файлов и кнопку `Продолжить реализацию`.

Что добавить в код:

- `agentHealth`: таймауты, количество провалов, lastSeen, текущая задача.
- `replacementPolicy`: подбор похожего агента по роли, модели, скорости,
  надёжности и бюджету.
- `handoffContext`: исходный prompt, последние файлы, ошибки, expected output.
- UI-бейджи: `уволен`, `нанят`, `заменён`, `recovered`, `partial`.
- Тест: два агента падают подряд, третий подхватывает задачу, раунд не зависает.

Приоритет: высокий. Это критично для режима, где агенты реально пишут проект.

### 10. По скриншотам `test8`: агенты сделали фрагмент, а не полноценный проект

На скриншотах выбран workspace `C:\Users\makst\Documents\test8`. В файлах видно:

- есть `landing/index.html`, `landing/style.css`, `landing/script.js`;
- есть Markdown-планы;
- `src/` и `tests/` почти пустые;
- нет `package.json`;
- нет `vite.config.ts`;
- нет полноценного `src-tauri/Cargo.toml`, `tauri.conf.json`, `build.rs`;
- значит это статичный landing-фрагмент, а не готовый запускаемый Tauri/React проект.

Вероятная причина:

- агенты писали контент в один HTML-файл;
- supervisor считал наличие `landing/index.html` успехом;
- не было проверки обязательной структуры проекта после раунда;
- замена агентов сработала, но новый агент продолжил тот же неполный формат,
  вместо того чтобы восстановить полноценный scaffold.

Как исправить:

1. Для каждого типа проекта определить `ProjectCompletenessContract`.
2. Для Tauri + React требовать минимум:

```text
package.json
tsconfig.json
vite.config.ts
index.html
src/main.tsx
src/App.tsx
src/styles.css
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/build.rs
src-tauri/src/main.rs
```

3. После записи файлов запускать validation round:

```text
npm install / npm run check / npm run build
cargo check или npm run tauri:build, если доступно
```

4. Если найден только `landing/index.html`, помечать результат как `partial`:

```text
Проект не готов: создан статичный landing-фрагмент, но отсутствует Tauri/React scaffold.
Запущен recovery-раунд: нанят новый агент для сборки package.json, Vite и src-tauri.
```

5. В UI рядом с кнопкой `Продолжить реализацию` показывать не только «файлы
записаны», но и `готовность проекта`: `scaffold ok`, `build ok`, `partial`,
`failed`.

Приоритет: высокий. Иначе пользователь думает, что проект готов, хотя на диске
лежит только HTML/CSS фрагмент.

## Рекомендуемый порядок исправлений

1. Исправить duplicate React key в `BuildScreen.tsx` через стабильный `assignment.id`.
2. Добавить тест на дублирующиеся имена/роли агентов.
3. Добавить supervisor failover: если агент отпал, «уволить» его в отчёте,
   «нанять» похожего по роли/качеству и продолжить раунд без зависания.
4. Добавить проверку полноты проекта: отличать статичный `landing/index.html`
   от полноценного Tauri/React scaffold.
5. Переименовать Rust функцию `RamTeamAi_requires_stream` в snake_case.
6. Проверить возможность переименования crate lib в `ram_team_ai_lib`.
7. Вынести `roleLabel` из `RoleBadge.tsx` для чистого Fast Refresh.
8. Добавить скрипт единого логирования dev/build процессов.
9. Позже оптимизировать bundle/code splitting.

## Команды для повторной проверки после исправлений

```text
npm run check
npm test
npm run build
cargo check
npm run tauri:build
```

Если `tauri build --bundles nsis` завершится с ошибкой, нужно добавить свежий stderr/stdout в этот отчёт отдельной секцией `Release build logs`.

## Что проверить после завершения агентов/сборки

Когда агенты точно закончат проект и `tauri build --bundles nsis` остановится:

1. Снова снять список свежих логов:

```powershell
Get-ChildItem -Recurse -File -Include *.log,*.err.log,*.out.log |
  Select-Object FullName,Length,LastWriteTime |
  Sort-Object LastWriteTime -Descending
```

2. Найти ошибки:

```powershell
Select-String -Path *.log,*.err.log,*.out.log -Pattern "error|warning|failed|panic|exception|duplicate|not defined" -CaseSensitive:$false
```

3. Запустить полный набор проверок из секции выше.
4. Обновить этот файл: добавить свежую секцию с датой, логами и финальным статусом.


---

## Update 2026-06-18 ? fixes applied

Implemented from the report:

1. Fixed React duplicate keys in `BuildScreen.tsx`: `ImplementationAssignment` now has stable `id`, and cards use `key={item.id}`.
2. Added tests for duplicate agent names/roles and project completeness validation.
3. Added failover hardening: failed agents can be marked `fired`, replacements `hired`, replacement selection excludes already failed agents, empty implementation output is treated as recoverable failure, and exhausted recovery becomes `partial` instead of hanging.
4. Added `ProjectCompletenessReport` with a Tauri/React contract and `landing/*` detection as `partial`.
5. Project Builder now writes a minimal Tauri + React scaffold for Tauri/React artifacts in both web and Rust paths.
6. Build screen now shows readiness (`scaffold ok`, `build ok`, `partial`, `failed`) and offers continue implementation for partial results.
7. Renamed Rust lib crate to `ram_team_ai_lib` and `RamTeamAi_requires_stream` to `ram_team_ai_requires_stream`; `cargo check` has no naming warnings.
8. Moved `roleLabel` out of `RoleBadge.tsx` to `src/lib/roles.ts` for cleaner Fast Refresh boundaries.
9. Added `scripts/dev-with-logs.ps1` and `npm run dev:logs` for timestamped dev logs under `logs/dev/`.
10. Fixed release packaging config: bundle icons are listed, and local unsigned `tauri:build` uses `tauri.release-no-updater.json` so updater signing is not required.

Verification:

```text
npm run check        OK
npm run check:test   OK
npm test             OK, 5 files / 27 tests
npm run build        OK, Vite build completed with existing >500 kB chunk warning
cargo check          OK
npm run tauri:build  OK, created MSI and NSIS bundles
```

Generated bundles:

```text
src-tauri/target/release/bundle/msi/RamTeamAi_0.1.2_x64_en-US.msi
src-tauri/target/release/bundle/nsis/RamTeamAi_0.1.2_x64-setup.exe
```

Remaining non-blocking warning:

- Vite still warns that the main JS chunk is larger than 500 kB. This is now the main follow-up for later code splitting.
