"use client";

import { useEffect, useId, useState } from "react";

const desktopReleaseUrl =
  "https://github.com/gerathewitcher/zerizeha/releases/latest";
const latestReleaseApiUrl =
  "https://api.github.com/repos/gerathewitcher/zerizeha/releases/latest";

type DesktopDownloadButtonProps = {
  className?: string;
  menuPlacement?: "top" | "bottom" | "right" | "left";
  wrapperClassName?: string;
};

type DesktopDownloadLinks = {
  windows: string;
  linuxAppImage: string;
  linuxDeb: string;
};

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

function findAssetUrl(
  assets: GitHubReleaseAsset[],
  pattern: RegExp,
): string | null {
  const asset = assets.find(
    (item) =>
      typeof item.name === "string" &&
      pattern.test(item.name) &&
      typeof item.browser_download_url === "string",
  );
  return asset?.browser_download_url ?? null;
}

function isElectronRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.electron);
}

function getMenuPositionClass(menuPlacement: DesktopDownloadButtonProps["menuPlacement"]) {
  switch (menuPlacement) {
    case "top":
      return "bottom-full right-0 mb-2";
    case "right":
      return "left-full top-0 ml-2";
    case "left":
      return "right-full top-0 mr-2";
    default:
      return "right-0 top-full mt-2";
  }
}

function getClosedMenuTransform(
  menuPlacement: DesktopDownloadButtonProps["menuPlacement"],
) {
  switch (menuPlacement) {
    case "top":
      return "translate-y-2";
    case "right":
      return "-translate-x-2";
    case "left":
      return "translate-x-2";
    default:
      return "-translate-y-2";
  }
}

export default function DesktopDownloadButton({
  className,
  menuPlacement = "bottom",
  wrapperClassName,
}: DesktopDownloadButtonProps) {
  const downloadFrameId = useId();
  const downloadFrameName = `desktop-download-${downloadFrameId.replace(
    /:/g,
    "",
  )}`;
  const [isElectron, setIsElectron] = useState(isElectronRuntime);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadLinks, setDownloadLinks] =
    useState<DesktopDownloadLinks | null>(null);
  const [downloadLinksStatus, setDownloadLinksStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const controller = new AbortController();
    setDownloadLinksStatus("loading");
    fetch(latestReleaseApiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`GitHub release request failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          assets?: GitHubReleaseAsset[];
        };
        const assets = payload.assets ?? [];
        const links = {
          windows:
            findAssetUrl(assets, /^Zerizeha-Setup-\d+\.\d+\.\d+\.exe$/) ??
            desktopReleaseUrl,
          linuxAppImage:
            findAssetUrl(assets, /^Zerizeha-\d+\.\d+\.\d+\.AppImage$/) ??
            desktopReleaseUrl,
          linuxDeb:
            findAssetUrl(assets, /^zerizeha_\d+\.\d+\.\d+_amd64\.deb$/) ??
            desktopReleaseUrl,
        };
        setDownloadLinks(links);
        setDownloadLinksStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load desktop release links", err);
        setDownloadLinks(null);
        setDownloadLinksStatus("error");
      });

    return () => controller.abort();
  }, [menuOpen]);

  if (isElectron) return null;

  return (
    <div className={wrapperClassName ?? "relative w-fit"}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={
          className ??
          "flex w-fit items-center gap-3 rounded-xl border border-(--border) bg-(--panel) px-4 py-3 text-left text-sm font-medium text-(--text) shadow-(--shadow-1) transition hover:border-(--accent) hover:text-(--accent)"
        }
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2)">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 3v11"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="m7.5 10 4.5 4.5L16.5 10"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 17.5v1.2c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-1.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span>
          <span className="block">Скачать desktop версию</span>
          <span className="mt-1 block text-xs font-normal text-(--subtle)">
            Windows / Linux
          </span>
        </span>
      </button>

      <div
        className={`absolute z-50 w-60 rounded-lg border border-(--border) bg-(--panel) p-1.5 text-left shadow-(--shadow-2) transition duration-150 ease-out ${
          getMenuPositionClass(menuPlacement)
        } ${
          menuOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : `pointer-events-none scale-95 opacity-0 ${getClosedMenuTransform(
                menuPlacement,
              )}`
        }`}
        role="menu"
      >
        <div className="flex flex-col gap-1.5">
          <a
            href={downloadLinks?.windows ?? desktopReleaseUrl}
            target={downloadFrameName}
            className="block rounded-md border border-(--border) bg-(--panel-2) px-3 py-2 text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <span>
              <span className="block">Windows</span>
              <span className="mt-1 block text-xs font-normal text-(--subtle)">
                Установщик .exe
              </span>
            </span>
          </a>
          <a
            href={downloadLinks?.linuxAppImage ?? desktopReleaseUrl}
            target={downloadFrameName}
            className="block rounded-md border border-(--border) bg-(--panel-2) px-3 py-2 text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <span>
              <span className="block">Linux AppImage</span>
              <span className="mt-1 block text-xs font-normal text-(--subtle)">
                Портативная сборка
              </span>
            </span>
          </a>
          <a
            href={downloadLinks?.linuxDeb ?? desktopReleaseUrl}
            target={downloadFrameName}
            className="block rounded-md border border-(--border) bg-(--panel-2) px-3 py-2 text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
            onClick={() => setMenuOpen(false)}
            role="menuitem"
          >
            <span>
              <span className="block">Linux deb</span>
              <span className="mt-1 block text-xs font-normal text-(--subtle)">
                Пакет для Debian/Ubuntu
              </span>
            </span>
          </a>
          {downloadLinksStatus === "error" ? (
            <p className="text-xs text-(--subtle)">
              Не удалось получить прямые ссылки. Откроется страница последнего
              релиза.
            </p>
          ) : null}
        </div>
      </div>
      <iframe
        className="hidden"
        name={downloadFrameName}
        title="Desktop download"
      />
    </div>
  );
}
