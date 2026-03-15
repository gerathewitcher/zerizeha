"use client";

import { redirectToLogin } from "@/lib/api/auth-recovery";
import { getHttpStatus } from "@/lib/api/errors";

export function redirectIfAuthOrOnboardingError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const status = getHttpStatus(error);
  if (status === 401) {
    return redirectToLogin();
  }
  if (status === 403) {
    window.location.assign("/waiting");
    return true;
  }
  return false;
}
