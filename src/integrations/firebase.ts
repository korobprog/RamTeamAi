import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GithubAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type Auth } from "firebase/auth";
import { doc, getDoc, initializeFirestore, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import type { CloudSettingsSnapshot } from "../types";

type FirebaseRuntime = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let runtime: FirebaseRuntime | undefined;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey?.trim()
      && firebaseConfig.authDomain?.trim()
      && firebaseConfig.projectId?.trim()
      && firebaseConfig.appId?.trim(),
  );
}

function getFirebaseRuntime(): FirebaseRuntime {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Fill VITE_FIREBASE_* values in your local env file.");
  }

  if (!runtime) {
    const app = initializeApp(firebaseConfig);
    runtime = {
      app,
      auth: getAuth(app),
      db: initializeFirestore(app, { ignoreUndefinedProperties: true }),
    };
  }

  return runtime;
}

function stripUndefinedFields(value: unknown): unknown {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => {
      const cleaned = stripUndefinedFields(item);
      return cleaned === undefined ? null : cleaned;
    });
  }

  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedCleaned = stripUndefinedFields(nestedValue);
      if (nestedCleaned !== undefined) {
        cleaned[key] = nestedCleaned;
      }
    }
    return cleaned;
  }

  return value;
}

export async function signInFirebaseWithGithubToken(accessToken: string): Promise<string> {
  const { auth } = getFirebaseRuntime();
  const credential = GithubAuthProvider.credential(accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user.uid;
}

export async function loadFirebaseUid(): Promise<string | undefined> {
  if (!isFirebaseConfigured()) return undefined;

  const { auth } = getFirebaseRuntime();
  if (auth.currentUser) return auth.currentUser.uid;

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(undefined);
    }, 3000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(user?.uid);
      },
      () => {
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(undefined);
      },
    );
  });
}

export function describeFirebaseAuthError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;

  if (code === "auth/configuration-not-found") {
    return "Firebase Auth: GitHub provider is not enabled or not configured. Enable Authentication -> Sign-in method -> GitHub in Firebase Console and save the GitHub OAuth Client ID/Secret.";
  }

  return error instanceof Error ? error.message : String(error);
}

export async function signOutFirebase(): Promise<void> {
  if (!runtime) return;
  await signOut(runtime.auth);
}

export async function saveCloudSettings(uid: string, snapshot: CloudSettingsSnapshot): Promise<void> {
  const { db } = getFirebaseRuntime();
  const cleanSnapshot = stripUndefinedFields(snapshot) as CloudSettingsSnapshot;
  await setDoc(doc(db, "users", uid, "settings", "main"), {
    ...cleanSnapshot,
    updatedAtServer: serverTimestamp(),
  });
}

export async function loadCloudSettings(uid: string): Promise<CloudSettingsSnapshot | undefined> {
  const { db } = getFirebaseRuntime();
  const ref = doc(db, "users", uid, "settings", "main");
  const result = await getDoc(ref);
  if (!result.exists()) return undefined;
  return result.data() as CloudSettingsSnapshot;
}
