# Firebase sync

RamTeamAi синхронизирует только настройки пользователя:

- AI providers без `keyRef`, `maskedKey` и реальных API-ключей;
- agents;
- topology;
- metadata проектов;
- GitHub repo links.

Не синхронизируются:

- диалоги и сообщения;
- provider/API keys;
- GitHub access token;
- локальные абсолютные пути workspace.

## Firestore structure

```text
users/{firebaseUid}/settings/main
```

Для локальной разработки и деплоя можно использовать файл [`firestore.rules`](../firestore.rules).

## Minimal Firestore Rules

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## What to enable in Firebase Console

1. **Authentication → Sign-in method**: enable **GitHub** provider.
2. **Firestore Database**: create the database if it is not created yet.
3. **Firestore Rules**: paste the contents of [`firestore.rules`](../firestore.rules).

### `auth/configuration-not-found`

If GitHub device activation succeeds, but the app shows `Firebase: Error (auth/configuration-not-found)`,
the GitHub token was received locally and Firebase rejected the federation step. Check the Firebase project
from `VITE_FIREBASE_PROJECT_ID`:

1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **GitHub** provider.
3. Paste the GitHub OAuth App **Client ID** and **Client secret** into the Firebase provider settings.
4. In the same GitHub OAuth App, keep **Device Flow** enabled for local desktop login.

Until Firebase is fixed, the app can still keep the GitHub connection locally; cloud sync remains disabled.

## Local env

Copy `.env.example` to `.env.local` and fill:

- `VITE_GITHUB_CLIENT_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

GitHub OAuth App must have Device Flow enabled.

## Release env

`VITE_*` variables are Vite build-time variables. For GitHub Release installers
(`AppSetup.exe`, NSIS and DMG) they must be configured as GitHub Actions repository
secrets and passed into `.github/workflows/release.yml`; local `.env.local` values are
used only for local builds.
