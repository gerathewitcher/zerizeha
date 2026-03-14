import { refresh, updateMe } from "@/lib/api/generated/zerizeha-components";
import { getBaseUrl } from "@/lib/api/generated/zerizeha-fetcher";
import type { RefreshVariables } from "@/lib/api/generated/zerizeha-components";
import type { TokenResponse } from "@/lib/api/generated/zerizeha-schemas";

const resolveApiBase = () =>
  getBaseUrl(process.env.NEXT_PUBLIC_API_BASE ?? "localhost:8080");

const makeUrl = (path: string) => `${resolveApiBase()}${path}`;
const AUTH_GOOGLE_PATH = "/api/auth/google";
const AUTH_GITHUB_PATH = "/api/auth/github";
const AUTH_YANDEX_PATH = "/api/auth/yandex";

function openOAuthUrl(path: string) {
  if (typeof window === "undefined") return;

  const url = makeUrl(path);
  if (window.electron?.shell?.openExternal) {
    void window.electron.shell.openExternal(url);
    return;
  }

  window.location.assign(url);
}

export function loginWithGoogle() {
  openOAuthUrl(
    window.electron?.shell?.openExternal
      ? `${AUTH_GOOGLE_PATH}?client=desktop`
      : AUTH_GOOGLE_PATH,
  );
}

export function loginWithGithub() {
  if (typeof window === "undefined") return;
  window.location.assign(makeUrl(AUTH_GITHUB_PATH));
}

export function loginWithYandex() {
  if (typeof window === "undefined") return;
  window.location.assign(makeUrl(AUTH_YANDEX_PATH));
}

export async function logout(): Promise<void> {
  await fetch(makeUrl("/api/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
}

export async function updateUsername(username: string): Promise<void> {
  await updateMe({ body: { username } });
}

export async function refreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const body: RefreshVariables["body"] = { refresh_token: refreshToken };
  return refresh({ body });
}
