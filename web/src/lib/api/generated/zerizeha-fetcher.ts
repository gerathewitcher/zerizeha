/* eslint-disable @typescript-eslint/no-empty-object-type */
export type ZerizehaFetcherExtraProps = {
  /**
   * Base URL override for the backend. Defaults to NEXT_PUBLIC_API_BASE.
   */
  baseUrl?: string;
  /**
   * Access token injected into Authorization header if provided.
   */
  accessToken?: string;
  /**
   * Credentials mode for fetch (defaults to "include" to allow cookies).
   */
  credentials?: RequestCredentials;
  /**
   * Custom fetch implementation (defaults to global fetch).
   */
  fetcher?: typeof fetch;
  /**
   * Retry request once after refreshing session on 401 (browser only).
   */
  retryOnUnauthorized?: boolean;
};

const trimTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const DESKTOP_ACCESS_TOKEN_KEY = "desktop_access_token";
const DESKTOP_REFRESH_TOKEN_KEY = "desktop_refresh_token";

const isDesktopClient = () => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
};

const readDesktopToken = (key: string) => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
};

const persistDesktopTokens = (payload: {
  access_token?: string;
  refresh_token?: string;
}) => {
  if (typeof window === "undefined") return;
  if (payload.access_token) {
    window.localStorage.setItem(DESKTOP_ACCESS_TOKEN_KEY, payload.access_token);
  }
  if (payload.refresh_token) {
    window.localStorage.setItem(
      DESKTOP_REFRESH_TOKEN_KEY,
      payload.refresh_token,
    );
  }
};

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

export const getBaseUrl = (override?: string) => resolveBaseUrl(override);

export type ErrorWrapper<TError> =
  | TError
  | { status: "unknown"; payload: string };

export type HttpError = { status: number; payload: unknown };

export type ZerizehaFetcherOptions<TBody, THeaders, TQueryParams, TPathParams> =
  {
    url: string;
    method: string;
    body?: TBody;
    headers?: THeaders;
    queryParams?: TQueryParams;
    pathParams?: TPathParams;
    signal?: AbortSignal;
  } & ZerizehaFetcherExtraProps;

export async function zerizehaFetch<
  TData,
  TError,
  TBody extends {} | FormData | undefined | null,
  THeaders extends {},
  TQueryParams extends {},
  TPathParams extends {},
>({
  url,
  method,
  body,
  headers,
  pathParams,
  queryParams,
  signal,
  baseUrl,
  accessToken,
  credentials = "include",
  fetcher = fetch,
  retryOnUnauthorized = true,
}: ZerizehaFetcherOptions<
  TBody,
  THeaders,
  TQueryParams,
  TPathParams
>): Promise<TData> {
  let error: ErrorWrapper<TError> | HttpError;
  try {
    const requestHeaders: HeadersInit = { ...headers };

    if (accessToken && !requestHeaders.Authorization) {
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    }
    if (!requestHeaders.Authorization && isDesktopClient()) {
      const storedAccess = readDesktopToken(DESKTOP_ACCESS_TOKEN_KEY);
      if (storedAccess) {
        requestHeaders.Authorization = `Bearer ${storedAccess}`;
      }
    }

    const methodHasBody = body !== undefined && body !== null;
    if (methodHasBody && !(body instanceof FormData)) {
      requestHeaders["Content-Type"] = "application/json";
    }

    if (body instanceof FormData) {
      delete requestHeaders["Content-Type"];
    }

    const response = await fetcher(
      `${resolveBaseUrl(baseUrl)}${resolveUrl(url, queryParams, pathParams)}`,
      {
        signal,
        method: method.toUpperCase(),
        body: body
          ? body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
        headers: requestHeaders,
        credentials,
      },
    );
    if (!response.ok) {
      if (
        response.status === 401 &&
        retryOnUnauthorized &&
        typeof window !== "undefined" &&
        !url.startsWith("/api/auth/refresh")
      ) {
        const refreshed = await tryRefreshSession({
          baseUrl,
          credentials,
          fetcher,
        });
        if (refreshed) {
          return zerizehaFetch<
            TData,
            TError,
            TBody,
            THeaders,
            TQueryParams,
            TPathParams
          >({
            url,
            method,
            body,
            headers,
            pathParams,
            queryParams,
            signal,
            baseUrl,
            accessToken,
            credentials,
            fetcher,
            retryOnUnauthorized: false,
          } as ZerizehaFetcherOptions<
            TBody,
            THeaders,
            TQueryParams,
            TPathParams
          >);
        }
      }
      try {
        const payload = await response.json();
        error = { status: response.status, payload };
      } catch (e) {
        error = {
          status: response.status,
          payload:
            e instanceof Error
              ? `Unexpected error (${e.message})`
              : "Unexpected error",
        };
      }
    } else if (response.headers.get("content-type")?.includes("json")) {
      return await response.json();
    } else {
      // if it is not a json response, assume it is a blob and cast it to TData
      return (await response.blob()) as unknown as TData;
    }
  } catch (e) {
    const errorObject: Error = {
      name: "unknown" as const,
      message:
        e instanceof Error ? `Network error (${e.message})` : "Network error",
      stack: e as string,
    };
    throw errorObject;
  }
  throw error;
}

async function tryRefreshSession({
  baseUrl,
  credentials,
  fetcher,
}: {
  baseUrl?: string;
  credentials: RequestCredentials;
  fetcher: typeof fetch;
}): Promise<boolean> {
  try {
    const refreshToken = isDesktopClient()
      ? readDesktopToken(DESKTOP_REFRESH_TOKEN_KEY)
      : "";
    const res = await fetcher(`${resolveBaseUrl(baseUrl)}/api/auth/refresh`, {
      method: "POST",
      credentials,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        refreshToken ? { refresh_token: refreshToken } : {},
      ),
    });
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      const payload = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (isDesktopClient()) {
        persistDesktopTokens(payload);
      }
    }
    return true;
  } catch {
    return false;
  }
}

const resolveUrl = (
  url: string,
  queryParams: Record<string, string> = {},
  pathParams: Record<string, string> = {},
) => {
  let query = new URLSearchParams(queryParams).toString();
  if (query) query = `?${query}`;
  return (
    url.replace(/\{\w*\}/g, (key) => pathParams[key.slice(1, -1)] ?? "") + query
  );
};
