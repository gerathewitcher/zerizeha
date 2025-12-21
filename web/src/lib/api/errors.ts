import type { HttpError } from "@/lib/api/generated/zerizeha-fetcher";

export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return;
  if ("status" in error && typeof (error as HttpError).status === "number") {
    return (error as HttpError).status;
  }
}

export function isServerError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return typeof status === "number" && status >= 500;
}

