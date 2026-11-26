use std::path::Path;
use tauri::{command, AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use crate::config::{
    validate_media_folder_structured, AppConfig, ConfigService, FolderValidationError,
};
use crate::media::{MediaScanner, ScanResult};
use crate::logger::Logger;

pub const MAX_LOG_MESSAGE_LEN: usize = 2000;

pub fn validate_client_log(level: &str, message: &str) -> Result<(&'static str, String), String> {
    let sanitized_level = match level.to_uppercase().as_str() {
        "INFO" => "INFO",
        "WARN" => "WARN",
        "ERROR" => "ERROR",
        _ => return Err(format!("Invalid log level: '{}'. Must be INFO, WARN, or ERROR", level)),
    };

    let sanitized_message: String = message
        .chars()
        .filter(|c| !c.is_control() || *c == ' ')
        .take(MAX_LOG_MESSAGE_LEN)
        .collect();

    if sanitized_message.trim().is_empty() {
        return Err("Log message cannot be empty or solely control characters".to_string());
    }

    Ok((sanitized_level, sanitized_message))
}

#[command]
pub fn get_config(config_service: State<'_, ConfigService>) -> Result<AppConfig, String> {
    config_service.get_config()
}

#[command]
pub fn set_media_root(
    path: String,
    config_service: State<'_, ConfigService>,
    logger: State<'_, Logger>,
) -> Result<AppConfig, String> {
    logger.info(&format!("set_media_root invoked with path='{}'", path.trim()));
    match config_service.set_media_root(&path) {
        Ok(cfg) => {
            logger.info(&format!("Media root updated and persisted: '{}'", cfg.kiosk_media_root));
            Ok(cfg)
        }
        Err(err) => {
            logger.warn(&format!("set_media_root rejected: {}", err));
            Err(err)
        }
    }
}

#[command]
pub async fn pick_media_folder(
    app_handle: AppHandle,
    logger: State<'_, Logger>,
) -> Result<Option<String>, FolderValidationError> {
    logger.info("pick_media_folder invoked: opening native folder picker");
    let dialog_handle = app_handle.clone();

    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_handle
            .dialog()
            .file()
            .set_title("Select Kiosk Media Folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| FolderValidationError {
        code: "DIALOG_FAILED".to_string(),
        message: format!("Folder picker task failed: {}", e),
    })?;

    let Some(file_path) = picked else {
        logger.info("pick_media_folder cancelled by user");
        return Ok(None);
    };

    let path_buf = file_path.into_path().map_err(|e| FolderValidationError {
        code: "INVALID_PATH".to_string(),
        message: format!("Selected folder path could not be resolved: {}", e),
    })?;

    let path_str = path_buf.to_string_lossy().to_string();
    validate_media_folder_structured(&path_str).map_err(|err| {
        logger.warn(&format!("pick_media_folder validation failed: {}", err));
        err
    })?;

    logger.info(&format!("pick_media_folder selected valid folder: '{}'", path_str));
    Ok(Some(path_str))
}

#[command]
pub fn validate_media_folder_cmd(path: String) -> Result<String, FolderValidationError> {
    let validated = validate_media_folder_structured(&path)?;
    Ok(validated.to_string_lossy().to_string())
}

#[command]
pub fn get_media_items(
    config_service: State<'_, ConfigService>,
    logger: State<'_, Logger>,
) -> Result<ScanResult, String> {
    let cfg = config_service.get_config()?;
    let result = MediaScanner::scan_directory(Path::new(&cfg.kiosk_media_root));
    logger.info(&format!(
        "Media scan on '{}': {} items, {} orphans ignored, {} errors",
        result.root,
        result.items.len(),
        result.ignored_orphan_count,
        result.errors.len()
    ));
    Ok(result)
}

#[command]
pub fn log_client_message(
    level: String,
    message: String,
    logger: State<'_, Logger>,
) -> Result<(), String> {
    let (sanitized_level, sanitized_message) = validate_client_log(&level, &message)?;
    logger.log(sanitized_level, &format!("[CLIENT] {}", sanitized_message));
    Ok(())
}

#[command]
pub fn exit_kiosk_app(app_handle: AppHandle, logger: State<'_, Logger>) -> Result<(), String> {
    logger.info("exit_kiosk_app invoked: terminating process");
    app_handle.exit(0);
    Ok(())
}

#[command]
pub fn trigger_admin_shortcut(app_handle: AppHandle, logger: State<'_, Logger>) -> Result<(), String> {
    logger.info("trigger_admin_shortcut invoked: emitting open-admin-panel event");
    app_handle
        .emit("open-admin-panel", ())
        .map_err(|e| format!("Failed to emit open-admin-panel event: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_log_levels() {
        assert_eq!(validate_client_log("info", "test").unwrap().0, "INFO");
        assert_eq!(validate_client_log("WARN", "test").unwrap().0, "WARN");
        assert_eq!(validate_client_log("Error", "test").unwrap().0, "ERROR");
    }

    #[test]
    fn test_invalid_log_level() {
        assert!(validate_client_log("DEBUG", "test").is_err());
        assert!(validate_client_log("FATAL", "test").is_err());
    }

    #[test]
    fn test_sanitization_and_length_capping() {
        let dirty = "line1\nline2\rline3\tline4\x00clean";
        let (_, clean) = validate_client_log("INFO", dirty).unwrap();
        assert!(!clean.contains('\n'));
        assert!(!clean.contains('\r'));
        assert!(!clean.contains('\0'));

        let huge = "a".repeat(3000);
        let (_, capped) = validate_client_log("INFO", &huge).unwrap();
        assert_eq!(capped.len(), MAX_LOG_MESSAGE_LEN);
    }
}
