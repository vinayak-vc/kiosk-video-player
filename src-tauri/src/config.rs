use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Manager};

use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppConfig {
    pub kiosk_media_root: String,
    pub idle_timeout_seconds: u64,
    pub controls_auto_hide_seconds: u64,
    pub slideshow_mode: String,
    pub cards_per_page: usize,
    pub sfx_enabled: bool,
    pub return_to_gallery_on_end: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            kiosk_media_root: "C:/Kiosk/Media".to_string(),
            idle_timeout_seconds: 60,
            controls_auto_hide_seconds: 4,
            slideshow_mode: "shuffle".to_string(),
            cards_per_page: 8,
            sfx_enabled: true,
            return_to_gallery_on_end: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedConfig {
    pub kiosk_media_root: Option<String>,
}

#[derive(Clone)]
pub struct ConfigService {
    config: Arc<RwLock<AppConfig>>,
    app_data_dir: Arc<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FolderValidationError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for FolderValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

/// Validates that a folder path exists, is a directory, and is readable, returning structured errors.
pub fn validate_media_folder_structured(raw_path: &str) -> Result<PathBuf, FolderValidationError> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err(FolderValidationError {
            code: "EMPTY_PATH".to_string(),
            message: "Media folder path cannot be empty".to_string(),
        });
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err(FolderValidationError {
            code: "NOT_FOUND".to_string(),
            message: format!("Media folder does not exist: {}", trimmed),
        });
    }
    if !path.is_dir() {
        return Err(FolderValidationError {
            code: "NOT_DIRECTORY".to_string(),
            message: format!("Media path is not a directory: {}", trimmed),
        });
    }

    fs::read_dir(&path).map_err(|e| FolderValidationError {
        code: "NOT_READABLE".to_string(),
        message: format!("Media folder is not readable ({}): {}", trimmed, e),
    })?;

    Ok(path)
}

/// Validates that a folder path exists, is a directory, and is readable.
pub fn validate_media_folder(raw_path: &str) -> Result<PathBuf, String> {
    validate_media_folder_structured(raw_path).map_err(|e| e.message)
}

/// Parses a .env file content into key-value pairs without logging secrets.
/// Strips a leading UTF-8 BOM (e.g. from Windows Notepad) and handles CRLF/LF.
pub fn parse_env_content(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let stripped = content.strip_prefix('\u{feff}').unwrap_or(content);
    for raw_line in stripped.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim();
            let mut val = v.trim();
            if val.len() >= 2
                && ((val.starts_with('"') && val.ends_with('"'))
                    || (val.starts_with('\'') && val.ends_with('\'')))
            {
                val = &val[1..val.len() - 1];
            }
            if !key.is_empty() {
                map.insert(key.to_string(), val.to_string());
            }
        }
    }
    map
}

const KNOWN_ENV_KEYS: &[&str] = &[
    "KIOSK_MEDIA_ROOT",
    "IDLE_TIMEOUT_SECONDS",
    "CONTROLS_AUTO_HIDE_SECONDS",
    "SLIDESHOW_MODE",
    "CARDS_PER_PAGE",
    "SFX_ENABLED",
    "RETURN_TO_GALLERY_ON_END",
];

/// Resolves the path to `.env`:
/// - In debug/dev builds: checks current working dir and its parent (project root) first, then beside exe.
/// - In release builds: beside the executable.
pub fn resolve_env_path() -> Option<PathBuf> {
    if cfg!(debug_assertions)
        && let Ok(cwd) = std::env::current_dir()
    {
        let candidate = cwd.join(".env");
        if candidate.is_file() {
            return Some(candidate);
        }
        if let Some(parent) = cwd.parent() {
            let parent_candidate = parent.join(".env");
            if parent_candidate.is_file() {
                return Some(parent_candidate);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe()
        && let Some(exe_dir) = exe.parent()
    {
        let exe_env = exe_dir.join(".env");
        if exe_env.is_file() {
            return Some(exe_env);
        }
    }

    None
}

fn parse_bool(val: &str) -> Option<bool> {
    match val.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Some(true),
        "false" | "0" | "no" => Some(false),
        _ => None,
    }
}

/// Builds `AppConfig` from an optional `.env` file path and `app_data_dir/config.json`.
/// Priority: `config.json` (admin override) > `.env` > defaults.
/// Never writes `.env`. Invalid values fall back to defaults with a warning via `logger`.
pub fn load_config_from_paths(
    env_path: Option<&Path>,
    app_data_dir: &Path,
    logger: Option<&Logger>,
) -> AppConfig {
    let mut cfg = AppConfig::default();

    let warn = |msg: &str| {
        if let Some(l) = logger {
            l.warn(msg);
        } else {
            eprintln!("[WARN] {}", msg);
        }
    };

    if let Some(path) = env_path {
        match fs::read_to_string(path) {
            Ok(content) => {
                let env_map = parse_env_content(&content);

                let mut unknown_keys: Vec<&str> = env_map
                    .keys()
                    .map(|k| k.as_str())
                    .filter(|k| !KNOWN_ENV_KEYS.contains(k))
                    .collect();
                if !unknown_keys.is_empty() {
                    unknown_keys.sort_unstable();
                    warn(&format!(
                        "Unknown keys in .env ignored: {}",
                        unknown_keys.join(", ")
                    ));
                }

                if let Some(v) = env_map.get("KIOSK_MEDIA_ROOT") {
                    if !v.trim().is_empty() {
                        cfg.kiosk_media_root = v.trim().to_string();
                    } else {
                        warn("Invalid KIOSK_MEDIA_ROOT in .env (empty); using default");
                    }
                }

                if let Some(v) = env_map.get("IDLE_TIMEOUT_SECONDS") {
                    match v.trim().parse::<u64>() {
                        Ok(n) if n > 0 => cfg.idle_timeout_seconds = n,
                        _ => warn("Invalid IDLE_TIMEOUT_SECONDS in .env; using default (60)"),
                    }
                }

                if let Some(v) = env_map.get("CONTROLS_AUTO_HIDE_SECONDS") {
                    match v.trim().parse::<u64>() {
                        Ok(n) if n > 0 => cfg.controls_auto_hide_seconds = n,
                        _ => warn("Invalid CONTROLS_AUTO_HIDE_SECONDS in .env; using default (4)"),
                    }
                }

                if let Some(v) = env_map.get("SLIDESHOW_MODE") {
                    let mode = v.trim().to_ascii_lowercase();
                    if mode == "shuffle" || mode == "sequential" {
                        cfg.slideshow_mode = mode;
                    } else {
                        warn("Invalid SLIDESHOW_MODE in .env; using default (shuffle)");
                    }
                }

                if let Some(v) = env_map.get("CARDS_PER_PAGE") {
                    match v.trim().parse::<usize>() {
                        Ok(n) if n > 0 => cfg.cards_per_page = n,
                        _ => warn("Invalid CARDS_PER_PAGE in .env; using default (8)"),
                    }
                }

                if let Some(v) = env_map.get("SFX_ENABLED") {
                    match parse_bool(v) {
                        Some(b) => cfg.sfx_enabled = b,
                        None => warn("Invalid SFX_ENABLED in .env; using default (true)"),
                    }
                }

                if let Some(v) = env_map.get("RETURN_TO_GALLERY_ON_END") {
                    match parse_bool(v) {
                        Some(b) => cfg.return_to_gallery_on_end = b,
                        None => warn("Invalid RETURN_TO_GALLERY_ON_END in .env; using default (true)"),
                    }
                }
            }
            Err(e) => {
                warn(&format!("Failed to read .env file: {}", e));
            }
        }
    }

    let config_json_path = app_data_dir.join("config.json");
    if config_json_path.is_file() {
        match fs::read_to_string(&config_json_path) {
            Ok(content) => match serde_json::from_str::<PersistedConfig>(&content) {
                Ok(persisted) => {
                    if let Some(root) = persisted.kiosk_media_root
                        && !root.trim().is_empty()
                    {
                        cfg.kiosk_media_root = root.trim().to_string();
                    }
                }
                Err(e) => warn(&format!("Invalid config.json; ignoring override: {}", e)),
            },
            Err(e) => warn(&format!("Failed to read config.json: {}", e)),
        }
    }

    cfg
}

impl ConfigService {
    pub fn init(app_handle: &AppHandle, logger: &Logger) -> Result<Self, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;

        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app_data_dir: {}", e))?;

        let env_path = resolve_env_path();
        if let Some(ref p) = env_path {
            logger.info(&format!("Loading configuration from .env at {:?}", p));
        } else {
            logger.info("No .env file found; using defaults and persisted overrides");
        }

        let cfg = load_config_from_paths(env_path.as_deref(), &app_data_dir, Some(logger));
        logger.info(&format!(
            "Active configuration: media_root='{}', idle={}s, auto_hide={}s, slideshow={}, cards_per_page={}",
            cfg.kiosk_media_root,
            cfg.idle_timeout_seconds,
            cfg.controls_auto_hide_seconds,
            cfg.slideshow_mode,
            cfg.cards_per_page
        ));

        Ok(Self {
            config: Arc::new(RwLock::new(cfg)),
            app_data_dir: Arc::new(app_data_dir),
        })
    }

    pub fn new_for_test(env_path: Option<&Path>, app_data_dir: PathBuf) -> Self {
        let cfg = load_config_from_paths(env_path, &app_data_dir, None);
        Self {
            config: Arc::new(RwLock::new(cfg)),
            app_data_dir: Arc::new(app_data_dir),
        }
    }

    pub fn get_config(&self) -> Result<AppConfig, String> {
        self.config
            .read()
            .map(|guard| guard.clone())
            .map_err(|e| format!("Config lock poisoned: {}", e))
    }

    pub fn set_media_root(&self, new_root: &str) -> Result<AppConfig, String> {
        let validated = validate_media_folder(new_root)?;
        let normalized = validated
            .to_str()
            .ok_or_else(|| "Media folder path must be valid UTF-8".to_string())?
            .to_string();

        fs::create_dir_all(self.app_data_dir.as_path())
            .map_err(|e| format!("Failed to ensure app_data_dir: {}", e))?;

        let persisted = PersistedConfig {
            kiosk_media_root: Some(normalized.clone()),
        };
        let json = serde_json::to_string_pretty(&persisted)
            .map_err(|e| format!("Failed to serialize config.json: {}", e))?;

        // Atomic write: write to temp file then rename to prevent corruption on power loss
        let tmp_path = self.app_data_dir.join("config.json.tmp");
        let final_path = self.app_data_dir.join("config.json");
        fs::write(&tmp_path, json)
            .map_err(|e| format!("Failed to write config.json.tmp: {}", e))?;
        fs::rename(&tmp_path, &final_path)
            .map_err(|e| format!("Failed to replace config.json: {}", e))?;

        let mut guard = self
            .config
            .write()
            .map_err(|e| format!("Config lock poisoned: {}", e))?;
        guard.kiosk_media_root = normalized;
        Ok(guard.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("kiosk_cfg_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_env_parsing_and_defaults_on_invalid_values() {
        let tmp = make_temp_dir("env_parse");
        let env_file = tmp.join(".env");
        fs::write(
            &env_file,
            r#"
# Comment line
KIOSK_MEDIA_ROOT="D:/Videos"
IDLE_TIMEOUT_SECONDS=not_a_number
CONTROLS_AUTO_HIDE_SECONDS=0
SLIDESHOW_MODE=invalid_mode
CARDS_PER_PAGE=12
SFX_ENABLED=false
RETURN_TO_GALLERY_ON_END=invalid_bool
"#,
        )
        .unwrap();

        let app_data = tmp.join("appdata");
        fs::create_dir_all(&app_data).unwrap();

        let cfg = load_config_from_paths(Some(&env_file), &app_data, None);
        assert_eq!(cfg.kiosk_media_root, "D:/Videos");
        assert_eq!(cfg.idle_timeout_seconds, 60); // invalid -> default
        assert_eq!(cfg.controls_auto_hide_seconds, 4); // 0 -> default
        assert_eq!(cfg.slideshow_mode, "shuffle"); // invalid -> default
        assert_eq!(cfg.cards_per_page, 12);
        assert!(!cfg.sfx_enabled);
        assert!(cfg.return_to_gallery_on_end); // invalid -> default

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_admin_override_priority_over_env_and_never_writes_env() {
        let tmp = make_temp_dir("priority");
        let env_file = tmp.join(".env");
        let original_env = "KIOSK_MEDIA_ROOT=C:/EnvMedia\nIDLE_TIMEOUT_SECONDS=90\n";
        fs::write(&env_file, original_env).unwrap();

        let app_data = tmp.join("appdata");
        let media_dir = tmp.join("admin_media");
        fs::create_dir_all(&media_dir).unwrap();

        let svc = ConfigService::new_for_test(Some(&env_file), app_data.clone());
        assert_eq!(svc.get_config().unwrap().kiosk_media_root, "C:/EnvMedia");
        assert_eq!(svc.get_config().unwrap().idle_timeout_seconds, 90);

        let updated = svc.set_media_root(media_dir.to_str().unwrap()).unwrap();
        assert_eq!(updated.kiosk_media_root, media_dir.to_string_lossy());

        // Reload from disk: config.json must override .env
        let reloaded = load_config_from_paths(Some(&env_file), &app_data, None);
        assert_eq!(reloaded.kiosk_media_root, media_dir.to_string_lossy());
        assert_eq!(reloaded.idle_timeout_seconds, 90);

        // .env must NEVER be modified
        assert_eq!(fs::read_to_string(&env_file).unwrap(), original_env);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_validate_media_folder_rejects_invalid_paths() {
        let tmp = make_temp_dir("validate");
        let file_path = tmp.join("not_a_dir.txt");
        fs::write(&file_path, "hi").unwrap();

        assert_eq!(validate_media_folder_structured("").unwrap_err().code, "EMPTY_PATH");
        assert_eq!(validate_media_folder_structured("   ").unwrap_err().code, "EMPTY_PATH");
        assert_eq!(
            validate_media_folder_structured(tmp.join("missing").to_str().unwrap())
                .unwrap_err()
                .code,
            "NOT_FOUND"
        );
        assert_eq!(
            validate_media_folder_structured(file_path.to_str().unwrap())
                .unwrap_err()
                .code,
            "NOT_DIRECTORY"
        );
        assert!(validate_media_folder(tmp.to_str().unwrap()).is_ok());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_env_bom_and_crlf_line_endings() {
        let tmp = make_temp_dir("bom_crlf");
        let env_file = tmp.join(".env");
        // UTF-8 BOM + CRLF + unknown key
        let content = "\u{feff}KIOSK_MEDIA_ROOT=E:/BomMedia\r\nIDLE_TIMEOUT_SECONDS=45\r\nUNKNOWN_SETTING=secret_value\r\n";
        fs::write(&env_file, content.as_bytes()).unwrap();

        let app_data = tmp.join("appdata");
        fs::create_dir_all(&app_data).unwrap();

        let cfg = load_config_from_paths(Some(&env_file), &app_data, None);
        assert_eq!(cfg.kiosk_media_root, "E:/BomMedia");
        assert_eq!(cfg.idle_timeout_seconds, 45);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_corrupt_config_json_ignored_without_crash() {
        let tmp = make_temp_dir("corrupt_json");
        let env_file = tmp.join(".env");
        fs::write(&env_file, "KIOSK_MEDIA_ROOT=C:/FallbackMedia\n").unwrap();

        let app_data = tmp.join("appdata");
        fs::create_dir_all(&app_data).unwrap();
        fs::write(app_data.join("config.json"), "{ not valid json !!!").unwrap();

        let cfg = load_config_from_paths(Some(&env_file), &app_data, None);
        assert_eq!(cfg.kiosk_media_root, "C:/FallbackMedia");

        let _ = fs::remove_dir_all(&tmp);
    }
}
