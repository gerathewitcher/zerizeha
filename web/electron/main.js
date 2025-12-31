const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { uIOhook, UiohookKey } = require("uiohook-napi");

const isDev = !app.isPackaged;
const startUrl = process.env.ELECTRON_START_URL || (isDev
  ? "http://localhost:3000"
  : "https://zzeha.ru:8443");
const iconBasePath = path.join(__dirname, "assets");
const iconPath = process.platform === "win32"
  ? path.join(iconBasePath, "app.ico")
  : path.join(iconBasePath, "app.png");
const trayPath = process.platform === "win32"
  ? path.join(iconBasePath, "tray.ico")
  : path.join(iconBasePath, "tray.png");

let mainWindow;
let tray;
let isQuitting = false;
let pttEnabled = false;
let pttActive = false;
let pttBinding = { type: "key", keycode: UiohookKey.V };

const domCodeToUiohook = (code) => {
  if (!code) return null;
  if (code === "Mouse4") return { type: "mouse", button: 4 };
  if (code === "Mouse5") return { type: "mouse", button: 5 };
  if (code.startsWith("Key")) {
    const key = code.slice(3).toUpperCase();
    const keycode = UiohookKey[key];
    return keycode ? { type: "key", keycode } : null;
  }
  if (code.startsWith("Digit")) {
    const digit = code.slice(5);
    const keycode = UiohookKey[digit];
    return keycode ? { type: "key", keycode } : null;
  }
  const map = {
    Space: "Space",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Escape: "Escape",
    Enter: "Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backquote: "Backquote",
    ShiftLeft: "Shift",
    ShiftRight: "ShiftRight",
    ControlLeft: "Ctrl",
    ControlRight: "CtrlRight",
    AltLeft: "Alt",
    AltRight: "AltRight",
    MetaLeft: "Meta",
    MetaRight: "MetaRight",
  };
  const mapped = map[code];
  const keycode = mapped ? UiohookKey[mapped] : null;
  return keycode ? { type: "key", keycode } : null;
};

const sendPttState = (active) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("ptt:state", active);
};

const ensureHookStarted = () => {
  if (ensureHookStarted.started) return;
  ensureHookStarted.started = true;
  uIOhook.on("keydown", (event) => {
    if (!pttEnabled || pttBinding.type !== "key") return;
    if (event.keycode !== pttBinding.keycode) return;
    if (!pttActive) {
      pttActive = true;
      sendPttState(true);
    }
  });
  uIOhook.on("keyup", (event) => {
    if (!pttEnabled || pttBinding.type !== "key") return;
    if (event.keycode !== pttBinding.keycode) return;
    if (pttActive) {
      pttActive = false;
      sendPttState(false);
    }
  });
  uIOhook.on("mousedown", (event) => {
    if (!pttEnabled || pttBinding.type !== "mouse") return;
    if (event.button !== pttBinding.button) return;
    if (!pttActive) {
      pttActive = true;
      sendPttState(true);
    }
  });
  uIOhook.on("mouseup", (event) => {
    if (!pttEnabled || pttBinding.type !== "mouse") return;
    if (event.button !== pttBinding.button) return;
    if (pttActive) {
      pttActive = false;
      sendPttState(false);
    }
  });
  uIOhook.start();
};
ensureHookStarted.started = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(startUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadURL(startUrl);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

const createTray = () => {
  if (tray) return;
  let image;
  if (fs.existsSync(trayPath)) {
    image = nativeImage.createFromPath(trayPath);
  } else {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="#111827"/>
        <path d="M20 24h24v16H20z" fill="#7C3AED"/>
        <path d="M24 20h16v4H24z" fill="#A78BFA"/>
        <circle cx="32" cy="32" r="6" fill="#EDE9FE"/>
      </svg>
    `;
    image = nativeImage.createFromDataURL(
      `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    );
  }
  tray = new Tray(image);
  tray.setToolTip("Zerizeha");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Показать",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "Выйти",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
};

app.whenReady().then(async () => {
  const ses = session.defaultSession;
  if (ses?.setPermissionRequestHandler) {
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === "media" || permission === "display-capture") {
        callback(true);
        return;
      }
      callback(false);
    });
  }
  if (ses?.setDisplayMediaRequestHandler) {
    ses.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
        });
        const screenSource =
          sources.find((source) => source.id.startsWith("screen")) || sources[0];
        if (!screenSource) {
          callback({});
          return;
        }
        callback({ video: screenSource });
      } catch {
        callback({});
      }
    });
  }
  createWindow();
  createTray();
});

ipcMain.handle("ptt:set-enabled", (_event, enabled) => {
  pttEnabled = Boolean(enabled);
  ensureHookStarted();
  if (!pttEnabled && pttActive) {
    pttActive = false;
    sendPttState(false);
  }
});

ipcMain.handle("ptt:set-key", (_event, code) => {
  const mapped = domCodeToUiohook(String(code));
  if (mapped) {
    pttBinding = mapped;
    if (pttActive) {
      pttActive = false;
      sendPttState(false);
    }
  }
});

ipcMain.handle("desktop-capturer:get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep app alive in tray.
    return;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  try {
    uIOhook.stop();
  } catch {
    // ignore
  }
});
