use tauri::command;
use tauri::{AppHandle, Emitter};
use crate::config::AppConfig;
use crate::media::MediaItem;

#[command]
pub fn get_app_config() -> Result<AppConfig, String> {
    Ok(AppConfig::default())
}

#[command]
pub fn get_media_items() -> Result<Vec<MediaItem>, String> {
    Ok(Vec::new())
}

#[command]
pub fn log_client_message(level: String, message: String) -> Result<(), String> {
    eprintln!("[CLIENT {}] {}", level, message);
    Ok(())
}

#[command]
pub fn exit_kiosk_app(app_handle: AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

#[command]
pub fn trigger_admin_shortcut(app_handle: AppHandle) -> Result<(), String> {
    let _ = app_handle.emit("open-admin-panel", ());
    Ok(())
}
