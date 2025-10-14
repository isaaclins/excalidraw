#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
async fn open_server_window(app: AppHandle, url: String) -> Result<(), String> {
  let label = "excalidraw";
  if let Some(existing) = app.get_webview_window(label) {
    let _ = existing.set_url(WebviewUrl::External(url.parse().map_err(|_| "invalid url")?));
    let _ = existing.set_focus();
    return Ok(());
  }

  WebviewWindowBuilder::new(
    &app,
    label,
    WebviewUrl::External(url.parse().map_err(|_| "invalid url")?),
  )
  .title("Excalidraw")
  .build()
  .map_err(|e| e.to_string())?;

  // Close settings window if present
  if let Some(settings) = app.get_webview_window("settings") {
    let _ = settings.close();
  }

  Ok(())
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .invoke_handler(tauri::generate_handler![open_server_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


