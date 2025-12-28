#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::thread;
use tauri::Emitter;
use tauri::Manager;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

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
    app.path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join(relative))
        .filter(|path| path.exists())
}

fn start_app_server(app: &tauri::AppHandle) -> Option<Child> {
    let node_path = resolve_resource_path(app, "bin/node.exe")
        .or_else(|| resolve_resource_path(app, "bin/node"))
        .unwrap_or_else(|| PathBuf::from("node"));
    let server_path = resolve_resource_path(app, ".next/standalone/server.js")
        .or_else(|| resolve_resource_path(app, "standalone/server.js"))?;

    let server_dir = server_path.parent()?.to_path_buf();

    let mut cmd = Command::new(node_path);
    cmd.arg(server_path)
        .current_dir(&server_dir)
        .env("HOSTNAME", APP_SERVER_HOST)
        .env("PORT", APP_SERVER_PORT)
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    cmd.spawn().ok()
}

fn navigate_to_app(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let url = format!("http://{}:{}", APP_SERVER_HOST, APP_SERVER_PORT);
        let script = format!("window.location.replace('{url}');");
        let _ = window.eval(&script);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            start_oauth_listener(app.handle().clone());
            if !cfg!(debug_assertions) {
                let handle = app.handle().clone();
                let _child = start_app_server(&handle);
                thread::spawn(move || {
                    thread::sleep(std::time::Duration::from_millis(600));
                    navigate_to_app(&handle);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
