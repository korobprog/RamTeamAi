# Release and updates

This project ships one installer per operating system:

- Windows: `RamTeamAi_*_x64-setup.exe` via Tauri NSIS.
- macOS: `RamTeamAi_*.dmg` via Tauri DMG.

Release binaries should be uploaded to GitHub Releases, not committed as normal git blobs.

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

## Updater signing key

The app is configured to check updates from:

```text
https://github.com/korobprog/RamTeamAi_app/releases/latest/download/latest.json
```

The public updater key is stored in `src-tauri/tauri.conf.json`.
The private key must never be committed.

For this workspace the private key was generated at:

```text
C:\Users\makst\.tauri\RamTeamAi-updater.key
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

On Windows, copy the private key text with:

```powershell
Get-Content -Raw "$env:USERPROFILE\.tauri\RamTeamAi-updater.key"
```

Do not paste the private key into code, docs, commits, chats, issues, or release notes.

## Automatic release

The workflow `.github/workflows/release.yml` runs on tags matching `v*`.

It builds:

- Windows NSIS installer (`.exe`)
- macOS universal DMG (`.dmg`)
- Tauri updater artifacts and signatures
- `latest.json` for the updater endpoint

The GitHub Release is created as a draft. Review the assets and publish it manually.

## Local builds

Windows:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\RamTeamAi-updater.key"
npm run release:windows
```

macOS:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/RamTeamAi-updater.key"
npm run release:mac
```

Build outputs are under:

```text
src-tauri/target/release/bundle/
```

## User update flow

On app startup the frontend calls the Tauri updater.

If `latest.json` contains a version newer than the installed version, RamTeamAi shows an update banner. The user can click **Обновить**, then the app downloads, installs, and relaunches.

## Code signing

Updater signing is not the same as OS code signing.

For fewer warnings in production, also plan:

- Windows: Authenticode certificate.
- macOS: Apple Developer ID signing and notarization.
