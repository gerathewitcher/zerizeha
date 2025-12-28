"use client";

import { getBaseUrl } from "@/lib/api/generated/zerizeha-fetcher";

const toWebSocketOrigin = (origin: string) => {
  if (origin.startsWith("https://")) return `wss://${origin.slice("https://".length)}`;
  if (origin.startsWith("http://")) return `ws://${origin.slice("http://".length)}`;
  return origin;
};

const DESKTOP_ACCESS_TOKEN_KEY = "desktop_access_token";

const isDesktopClient = () => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
};

const readDesktopToken = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DESKTOP_ACCESS_TOKEN_KEY) ?? "";
};

export function buildWebSocketUrl(pathname: string, baseUrl?: string): string {
  const base =
    getBaseUrl(baseUrl) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const origin = toWebSocketOrigin(base);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const token = isDesktopClient() ? readDesktopToken() : "";
  if (!token) {
    return `${origin}${normalizedPath}`;
  }
  const separator = normalizedPath.includes("?") ? "&" : "?";
  return `${origin}${normalizedPath}${separator}access_token=${encodeURIComponent(token)}`;
}
