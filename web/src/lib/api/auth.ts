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
const DESKTOP_ACCESS_TOKEN_KEY = "desktop_access_token";
const DESKTOP_REFRESH_TOKEN_KEY = "desktop_refresh_token";

const isTauri = () => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
};

export function loginWithGoogle() {
  if (typeof window === "undefined") return;
  if (isTauri()) {
    void loginWithGoogleDesktop();
    return;
  }
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

export async function loginWithGoogleDesktop() {
  if (typeof window === "undefined") return;
  const url = makeUrl(`${AUTH_GOOGLE_PATH}?client=desktop`);
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  } catch (err) {
    console.error("Failed to open system browser for OAuth", err);
  }
}

export async function exchangeGoogleDesktopCode(code: string, state?: string) {
  const search = new URLSearchParams({ code });
  if (state) {
    search.set("state", state);
  }
  search.set("client", "desktop");
  const response = await fetch(
    makeUrl(`${AUTH_GOOGLE_PATH}/callback?${search.toString()}`),
    { credentials: "include" },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "OAuth exchange failed",
    );
  }

  const data = (await response.json()) as TokenResponse;
  persistDesktopTokens(data);
  return data;
}

export const isDesktopClient = isTauri;

function persistDesktopTokens(tokens: TokenResponse) {
  if (typeof window === "undefined") return;
  if (tokens.access_token) {
    window.localStorage.setItem(DESKTOP_ACCESS_TOKEN_KEY, tokens.access_token);
  }
  if (tokens.refresh_token) {
    window.localStorage.setItem(
      DESKTOP_REFRESH_TOKEN_KEY,
      tokens.refresh_token,
    );
  }
}

export async function refreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const body: RefreshVariables["body"] = { refresh_token: refreshToken };
  return refresh({ body });
}
