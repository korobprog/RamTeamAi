import { safeInvoke } from "../lib/tauri";
import type { GithubDeviceFlowResponse, GithubTokenPollResult, GithubUserProfile } from "../types";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
const DEFAULT_SCOPE = "read:user user:email repo";

export function isGithubConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID?.trim());
}

export function githubClientId(): string {
  return GITHUB_CLIENT_ID?.trim() ?? "";
}

export async function beginGithubDeviceFlow(scope = DEFAULT_SCOPE): Promise<GithubDeviceFlowResponse> {
  return safeInvoke<GithubDeviceFlowResponse>("github_begin_device_flow", {
    clientId: githubClientId(),
    scope,
  });
}

export async function pollGithubDeviceFlow(deviceCode: string): Promise<GithubTokenPollResult> {
  return safeInvoke<GithubTokenPollResult>("github_poll_device_flow", {
    clientId: githubClientId(),
    deviceCode,
  });
}

export async function loadGithubProfile(): Promise<GithubUserProfile | undefined> {
  const profile = await safeInvoke<GithubUserProfile | null>("github_load_profile", undefined, () => null);
  return profile ?? undefined;
}

export async function disconnectGithub(): Promise<void> {
  await safeInvoke<void>("github_disconnect", undefined, () => undefined);
}

