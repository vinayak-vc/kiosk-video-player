use tauri::WebviewWindow;

pub fn setup_kiosk_window(window: &WebviewWindow) -> Result<(), String> {
    // Basic window setup
    let _ = window.set_fullscreen(false);
    Ok(())
}
