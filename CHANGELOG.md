# Changelog

## 0.1.6

- Added explicit workspace access confirmation for existing projects.
- Auto-configured Filesystem MCP to the selected project folder.
- Attached workspace snapshots for audit/review prompts so agents can inspect existing code after folder access is granted.


## 0.1.5

- Fixed post-update GitHub profile status when Firebase cloud sync is not configured in release builds.
- Added resilient GitHub avatar fallback so blocked avatar images show the profile initial instead of a broken image.

## 0.1.4

- Neurogate moved to the top of the provider list.
- Added a compact Neurogate API connection CTA with the protected referral link and `$5` first top-up bonus.
- Extended CODEOWNERS/GitHub Actions protection and tests for the Neurogate referral link.

## 0.1.3

- Подготовлена новая версия 0.1.3; синхронизированы номера версий в package.json, Tauri config, Cargo.toml и README.
- Донат-кошельки вынесены в отдельный protected-файл, добавлены CODEOWNERS и GitHub Actions guard для PR.
- В настройках приложения добавлены ссылка на GitHub-репозиторий и отображение текущей версии.

## 0.1.2

- Fixed in-app update endpoint.
- Enabled signed updater artifacts in GitHub Actions releases.

## 0.1.1

- Updated desktop app release build.

## 0.1.0

- Initial desktop MVP.
- Added release packaging for Windows `.exe` installer and macOS `.dmg`.
- Added in-app update checks through the Tauri updater.
