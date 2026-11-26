use tauri::{command, AppHandle, Emitter, State};
use crate::config::AppConfig;
use crate::media::MediaItem;
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
pub fn get_app_config() -> Result<AppConfig, String> {
    Ok(AppConfig::default())
}

#[command]
pub fn get_media_items() -> Result<Vec<MediaItem>, String> {
    Ok(Vec::new())
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
