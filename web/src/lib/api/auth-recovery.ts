"use client";

type RefreshSessionOptions = {
  baseUrl?: string;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
};

const trimTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const withProtocol = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "https://"
      : "http://";
  return `${protocol}${value}`;
};

const defaultBaseUrl =
  typeof process !== "undefined"
    ? trimTrailingSlash(
        process.env.NEXT_PUBLIC_API_BASE
          ? withProtocol(process.env.NEXT_PUBLIC_API_BASE)
          : "",
      )
    : "";

const resolveBaseUrl = (override?: string) => {
  if (override) return trimTrailingSlash(withProtocol(override));
  return defaultBaseUrl || "";
};

let refreshPromise: Promise<boolean> | null = null;

export function redirectToLogin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/login") return false;
  window.location.assign("/login");
  return true;
}

export async function tryRefreshSession({
  baseUrl,
  credentials = "include",
  fetcher = fetch,
}: RefreshSessionOptions = {}): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const currentPromise = (async () => {
    try {
      const res = await fetcher(`${resolveBaseUrl(baseUrl)}/api/auth/refresh`, {
        method: "POST",
        credentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        const payload = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
        };
        void payload;
      }

      return true;
    } catch {
      return false;
    }
  })();

  refreshPromise = currentPromise;
  try {
    return await currentPromise;
  } finally {
    if (refreshPromise === currentPromise) {
      refreshPromise = null;
    }
  }
}

export async function recoverSessionOrRedirect(
  options?: RefreshSessionOptions,
): Promise<boolean> {
  const refreshed = await tryRefreshSession(options);
  if (!refreshed) {
    redirectToLogin();
  }
  return refreshed;
}
