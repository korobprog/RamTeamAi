# Release and updates

Проект распространяется как desktop-приложение Tauri для Windows и macOS.

## Целевая схема

- Windows: пользователь скачивает `AppSetup.exe` / `RamTeamAi_*_x64-setup.exe`, устанавливает приложение и дальше обновляется из приложения.
- macOS: пользователь скачивает `RamTeamAi_*.dmg`, переносит приложение в Applications и дальше обновляется из приложения. CI собирает universal DMG для Apple Silicon и Intel Mac.
- Обновление всегда требует подтверждения пользователя: кнопка **Обновить** открывает подтверждающий диалог, только после этого начинается загрузка и установка.
- Apple Developer ID и notarization для macOS на текущем этапе не используются.

> Важно: без Developer ID/notarization macOS может показывать предупреждения безопасности при первом запуске или после скачивания. Это ожидаемый компромисс выбранной схемы.

## Version

Use semantic versions without the leading `v` inside the app files:

```powershell
npm run version:set -- 0.1.1
```

This updates:

- `package.json`
- `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Create the git tag with the leading `v`:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

## Build installers

Windows NSIS installer:

```powershell
npm run release:windows
```

macOS DMG:

```bash
npm run release:mac
```

Build outputs are under:

```text
src-tauri/target/release/bundle/
```

## Updater endpoint

The app is configured to check updates from:

```text
https://github.com/korobprog/RamTeamAi/releases/latest/download/latest.json
```

Tauri uses this file to decide whether a newer version is available.

## Updater signing key

Updater signing is required so the installed app trusts downloaded update artifacts.

The public updater key is stored in:

```text
src-tauri/tauri.conf.json
```

The private key must never be committed.

For this workspace the private key was generated at:

```text
C:\Users\makst\.tauri\neurogate-updater.key
```

Back it up. If the private key is lost, already installed apps will not trust future update packages.

To generate a new key and write its public part into `tauri.conf.json`:

```powershell
npm run updater:key
```

For a password-protected key:

```powershell
npm run updater:key -- -Password "your-strong-password" -Force
```

## GitHub Secrets

Add these repository secrets before publishing:

- `TAURI_SIGNING_PRIVATE_KEY` — the full text content of the private key file.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — only if the key was generated with a password.
- `VITE_GITHUB_CLIENT_ID` — GitHub OAuth App client ID used by the desktop Device Flow login.
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

The `VITE_*` values are compiled into the frontend during the Vite build. They must be
available to GitHub Actions before `tauri-apps/tauri-action` runs; setting them only in a
local `.env.local` file does not affect release installers built by CI.

On Windows, copy the private key text with:

```powershell
Get-Content -Raw "$env:USERPROFILE\.tauri\neurogate-updater.key"
```

Do not paste the private key into code, docs, commits, chats, issues, or release notes.

## Automatic release

The workflow `.github/workflows/release.yml` runs on tags matching `v*`.

It builds:

- Windows NSIS installer (`.exe`)
- macOS universal DMG (`.dmg`)
- Tauri updater artifacts and signatures
- `latest.json` for the updater endpoint

The GitHub Release is created as a published release, not as a draft, so
`/releases/latest/` points to the newest updater metadata immediately.

## User update flow

1. Приложение запускается.
2. Frontend вызывает Tauri updater и проверяет `latest.json`.
3. Если доступна новая версия, показывается баннер:
   - версия обновления;
   - текущая версия;
   - changelog, если он есть;
   - кнопки **Обновить** и **Позже**.
4. Пользователь нажимает **Обновить**.
5. Приложение показывает системный диалог подтверждения.
6. Если пользователь подтверждает:
   - обновление скачивается;
   - показывается прогресс;
   - обновление устанавливается;
   - приложение перезапускается.
7. Если пользователь отменяет, установка не начинается.

## macOS without Developer ID/notarization

На текущем этапе выбран прямой вариант распространения:

```text
сайт/GitHub Release → скачать .dmg → установить → обновлять из приложения
```

Не делаем:

- Apple Developer ID signing;
- notarization;
- публикацию в Mac App Store;
- App Store Connect.

Ожидаемые ограничения:

- macOS Gatekeeper может попросить пользователя вручную подтвердить запуск;
- доверие пользователя ниже, чем у notarized-приложения;
- для публичного коммерческого релиза позже желательно вернуться к Developer ID/notarization.

## Code signing scope

Updater signing and OS code signing are different things.

Используем сейчас:

- Tauri updater signing — да, обязательно для обновлений.

Не используем сейчас:

- Windows Authenticode certificate;
- macOS Developer ID;
- macOS notarization.
