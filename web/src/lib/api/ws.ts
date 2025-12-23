"use client";

import { getBaseUrl } from "@/lib/api/generated/zerizeha-fetcher";

const toWebSocketOrigin = (origin: string) => {
  if (origin.startsWith("https://")) return `wss://${origin.slice("https://".length)}`;
  if (origin.startsWith("http://")) return `ws://${origin.slice("http://".length)}`;
  return origin;
};

export function buildWebSocketUrl(pathname: string, baseUrl?: string): string {
  const base =
    getBaseUrl(baseUrl) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const origin = toWebSocketOrigin(base);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${origin}${normalizedPath}`;
}

