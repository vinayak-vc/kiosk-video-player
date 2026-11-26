use tauri::{AppHandle, Manager};

pub fn setup_kiosk_window(app_handle: &AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Failed to find 'main' webview window".to_string())?;

    window
        .set_fullscreen(true)
        .map_err(|e| format!("Failed to set fullscreen: {}", e))?;

    window
        .set_decorations(false)
        .map_err(|e| format!("Failed to disable decorations: {}", e))?;

    window
        .set_resizable(false)
        .map_err(|e| format!("Failed to disable resizable: {}", e))?;

    Ok(())
}
