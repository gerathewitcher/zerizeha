#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;

const OAUTH_LISTEN_ADDR: &str = "127.0.0.1:5555";
const OAUTH_CALLBACK_PATH: &str = "/callback";
const APP_SERVER_HOST: &str = "127.0.0.1";
const APP_SERVER_PORT: &str = "4173";

#[derive(Clone, Serialize)]
struct OAuthCallbackPayload {
    code: String,
    state: String,
}

fn start_oauth_listener(app: tauri::AppHandle) {
    thread::spawn(move || {
        let server = match tiny_http::Server::http(OAUTH_LISTEN_ADDR) {
            Ok(server) => server,
            Err(err) => {
                eprintln!("oauth listener error: {err}");
                return;
            }
        };

        for request in server.incoming_requests() {
            let url = request.url().to_string();
            if !url.starts_with(OAUTH_CALLBACK_PATH) {
                let _ = request.respond(tiny_http::Response::empty(404));
                continue;
            }

            let query = url.splitn(2, '?').nth(1).unwrap_or("");
            let mut code = String::new();
            let mut state = String::new();
            for pair in query.split('&') {
                let mut parts = pair.splitn(2, '=');
                let key = parts.next().unwrap_or("");
                let value = parts.next().unwrap_or("");
                let decoded = urlencoding::decode(value).unwrap_or_default();
                match key {
                    "code" => code = decoded.into_owned(),
                    "state" => state = decoded.into_owned(),
                    _ => {}
                }
            }

            if !code.is_empty() {
                let payload = OAuthCallbackPayload { code, state };
                if let Err(err) = app.emit("oauth-google-callback", payload) {
                    eprintln!("oauth emit error: {err}");
                }
            }

            let html = "<!doctype html><html><head><meta charset=\"utf-8\"/></head><body><p>OAuth завершен. Можно закрыть это окно.</p></body></html>";
            let response = tiny_http::Response::from_string(html).with_status_code(200);
            let _ = request.respond(response);
        }
    });
}

fn resolve_resource_path(app: &tauri::AppHandle, relative: &str) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let direct = resource_dir.join(relative);
    if direct.exists() {
        return Some(direct);
    }
    let nested = resource_dir.join("src-tauri").join(relative);
    if nested.exists() {
        return Some(nested);
    }
    let web_nested = resource_dir.join("web").join("src-tauri").join(relative);
    if web_nested.exists() {
        return Some(web_nested);
    }
    None
}

fn log_line(app: &tauri::AppHandle, message: &str) {
    let path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("desktop.log"),
        Err(_) => return,
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

fn start_app_server(app: &tauri::AppHandle) -> Option<Child> {
    let node_path = resolve_resource_path(app, "bin/node.exe")
        .or_else(|| resolve_resource_path(app, "bin/node"))
        .unwrap_or_else(|| PathBuf::from("node"));
    let server_path = resolve_resource_path(app, "standalone/server.js")
        .or_else(|| resolve_resource_path(app, ".next/standalone/server.js"));

    if server_path.is_none() {
        log_line(
            app,
            "server.js not found in resources (checked standalone/server.js)",
        );
        return None;
    }
    let server_path = server_path?;

    let server_dir = server_path.parent()?.to_path_buf();

    log_line(
        app,
        &format!(
            "starting app server: node={:?} server={:?}",
            node_path, server_path
        ),
    );

    let mut cmd = Command::new(node_path);
    cmd.arg(server_path)
        .current_dir(&server_dir)
        .env("HOSTNAME", APP_SERVER_HOST)
        .env("PORT", APP_SERVER_PORT)
        .env("NODE_ENV", "production")
        .stdin(Stdio::null());

    let log_path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("desktop.log"),
        Err(_) => PathBuf::from("desktop.log"),
    };
    if let Ok(log_file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = cmd.stdout(Stdio::from(log_file.try_clone().ok()?));
        let _ = cmd.stderr(Stdio::from(log_file));
    } else {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }

    match cmd.spawn() {
        Ok(child) => Some(child),
        Err(err) => {
            log_line(app, &format!("failed to spawn app server: {err}"));
            None
        }
    }
}

fn navigate_to_app(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let url = format!("http://{}:{}", APP_SERVER_HOST, APP_SERVER_PORT);
        let script = format!("window.location.replace('{url}');");
        let _ = window.eval(&script);
    }
}

fn wait_for_server() -> bool {
    let addr = format!("{}:{}", APP_SERVER_HOST, APP_SERVER_PORT);
    let socket_addr = match addr.parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&socket_addr, Duration::from_millis(200)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            start_oauth_listener(app.handle().clone());
            if !cfg!(debug_assertions) {
                let handle = app.handle().clone();
                if let Ok(dir) = handle.path().app_data_dir() {
                    log_line(&handle, &format!("app data dir: {dir:?}"));
                }
                if let Ok(dir) = handle.path().resource_dir() {
                    log_line(&handle, &format!("resource dir: {dir:?}"));
                }
                let _child = start_app_server(&handle);
                thread::spawn(move || {
                    if wait_for_server() {
                        navigate_to_app(&handle);
                    } else if let Some(window) = handle.get_webview_window("main") {
                        let message = "Не удалось запустить локальный сервер. Проверьте desktop.log.";
                        let script = format!("document.body.innerText = {message:?};");
                        let _ = window.eval(&script);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
