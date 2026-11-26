use tauri::command;
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
