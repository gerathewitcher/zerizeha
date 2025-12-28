#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::thread;
use tauri::Emitter;

const OAUTH_LISTEN_ADDR: &str = "127.0.0.1:5555";
const OAUTH_CALLBACK_PATH: &str = "/callback";

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            start_oauth_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
