import { refresh } from "@/lib/api/generated/zerizeha-components";
import { getBaseUrl } from "@/lib/api/generated/zerizeha-fetcher";
import type { RefreshVariables } from "@/lib/api/generated/zerizeha-components";
import type { TokenResponse } from "@/lib/api/generated/zerizeha-schemas";

const resolveApiBase = () =>
  getBaseUrl(process.env.NEXT_PUBLIC_API_BASE ?? "localhost:8080");

const makeUrl = (path: string) => `${resolveApiBase()}${path}`;
const AUTH_GOOGLE_PATH = "/api/auth/google";
const AUTH_GITHUB_PATH = "/api/auth/github";
const AUTH_YANDEX_PATH = "/api/auth/yandex";

export function loginWithGoogle() {
  if (typeof window === "undefined") return;
  window.location.assign(makeUrl(AUTH_GOOGLE_PATH));
}

export function loginWithGithub() {
  if (typeof window === "undefined") return;
  window.location.assign(makeUrl(AUTH_GITHUB_PATH));
}

export function loginWithYandex() {
  if (typeof window === "undefined") return;
  window.location.assign(makeUrl(AUTH_YANDEX_PATH));
}

export async function refreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const body: RefreshVariables["body"] = { refresh_token: refreshToken };
  return refresh({ body });
}
