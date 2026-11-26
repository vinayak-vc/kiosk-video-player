use tauri::{AppHandle, Manager};

pub fn setup_kiosk_window(app_handle: &AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.set_fullscreen(true);
        let _ = window.set_decorations(false);
        let _ = window.set_resizable(false);
    }
    Ok(())
}
