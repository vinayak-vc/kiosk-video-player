use std::path::Path;
#[cfg(not(target_os = "android"))]
use tauri::Manager;
use tauri::{command, AppHandle, Emitter, State};
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;
use crate::config::{
    validate_media_folder_structured, AppConfig, ConfigService, FolderValidationError,
};
use crate::media::{MediaScanner, ScanResult};
use crate::logger::Logger;
use crate::watcher::MediaWatcher;

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
pub async fn set_media_root(
    path: String,
    config_service: State<'_, ConfigService>,
    media_watcher: State<'_, MediaWatcher>,
    logger: State<'_, Logger>,
) -> Result<AppConfig, String> {
    logger.info(&format!("set_media_root invoked with path='{}'", path.trim()));
    let cfg_svc = config_service.inner().clone();
    let path_clone = path.clone();

    let result = tauri::async_runtime::spawn_blocking(move || cfg_svc.set_media_root(&path_clone))
        .await
        .map_err(|e| {
            let msg = format!("set_media_root background task failed: {}", e);
            logger.error(&msg);
            msg
        })?;

    match result {
        Ok(cfg) => {
            if let Err(err) = media_watcher.set_target(Path::new(&cfg.kiosk_media_root)) {
                logger.warn(&format!("Failed to retarget MediaWatcher: {}", err));
            }
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
    #[allow(unused_variables)] app_handle: AppHandle,
    logger: State<'_, Logger>,
) -> Result<Option<String>, FolderValidationError> {
    #[cfg(target_os = "android")]
    {
        logger.info("pick_media_folder invoked on Android (not supported; use manual path input)");
        Err(FolderValidationError {
            code: "UNSUPPORTED_ON_ANDROID".to_string(),
            message: "Native folder picker is not available on Android.".to_string(),
        })
    }

    #[cfg(not(target_os = "android"))]
    {
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
}

#[command]
pub fn validate_media_folder_cmd(path: String) -> Result<String, FolderValidationError> {
    let validated = validate_media_folder_structured(&path)?;
    Ok(validated.to_string_lossy().to_string())
}

#[command]
pub async fn get_media_items(
    config_service: State<'_, ConfigService>,
    logger: State<'_, Logger>,
) -> Result<ScanResult, String> {
    let cfg = config_service.get_config()?;
    let root = cfg.kiosk_media_root;

    let result = tauri::async_runtime::spawn_blocking(move || {
        MediaScanner::scan_directory(Path::new(&root))
    })
    .await
    .map_err(|e| {
        let msg = format!("get_media_items scan task failed: {}", e);
        logger.error(&msg);
        msg
    })?;

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
pub fn exit_kiosk_app(
    #[allow(unused_variables)] app_handle: AppHandle,
    logger: State<'_, Logger>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        logger.info("exit_kiosk_app invoked on Android: calling MainActivity.exitKiosk");
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| format!("Failed to get JavaVM: {}", e))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("Failed to attach JNI thread: {}", e))?;
        let _ = env
            .with_local_frame(16, |env| {
                let cls = env.find_class("com/viitor/kioskplayer/MainActivity")?;
                env.call_static_method(cls, "exitKiosk", "()V", &[])?;
                Ok(())
            })
            .map_err(|e: jni::errors::Error| format!("MainActivity.exitKiosk JNI failed: {}", e));
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        logger.info("exit_kiosk_app invoked: terminating process");
        app_handle.exit(0);
        Ok(())
    }
}

#[cfg(target_os = "android")]
fn android_sdk_int(env: &mut jni::JNIEnv<'_>) -> Result<i32, String> {
    let cls = env
        .find_class("android/os/Build$VERSION")
        .map_err(|e| format!("find_class Build$VERSION failed: {}", e))?;
    env.get_static_field(cls, "SDK_INT", "I")
        .map_err(|e| format!("get SDK_INT failed: {}", e))?
        .i()
        .map_err(|e| format!("SDK_INT not int: {}", e))
}

#[cfg(target_os = "android")]
fn check_android_all_files_access() -> Result<bool, String> {
    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("Failed to get JavaVM: {}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("Failed to attach JNI thread: {}", e))?;

    let sdk_int = android_sdk_int(&mut env)?;
    env.with_local_frame(16, |env| {
        if sdk_int >= 30 {
            let env_cls = env.find_class("android/os/Environment")?;
            let granted = env
                .call_static_method(env_cls, "isExternalStorageManager", "()Z", &[])?
                .z()?;
            Ok(granted)
        } else {
            let app_ctx = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
            let perm = env.new_string("android.permission.READ_EXTERNAL_STORAGE")?;
            let status = env
                .call_method(
                    &app_ctx,
                    "checkSelfPermission",
                    "(Ljava/lang/String;)I",
                    &[jni::objects::JValue::Object(&perm)],
                )?
                .i()?;
            Ok(status == 0)
        }
    })
    .map_err(|e: jni::errors::Error| format!("check_android_all_files_access failed: {}", e))
}

#[cfg(target_os = "android")]
fn open_android_all_files_settings() -> Result<(), String> {
    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("Failed to get JavaVM: {}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("Failed to attach JNI thread: {}", e))?;
    let app_ctx = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };

    let sdk_int = android_sdk_int(&mut env)?;
    env.with_local_frame(32, |env| {
        let pkg_obj = env
            .call_method(&app_ctx, "getPackageName", "()Ljava/lang/String;", &[])?
            .l()?;
        let pkg_jstr = jni::objects::JString::from(pkg_obj);
        let pkg_name: String = env.get_string(&pkg_jstr)?.into();

        let uri_str = env.new_string(format!("package:{}", pkg_name))?;
        let uri_cls = env.find_class("android/net/Uri")?;
        let uri_obj = env
            .call_static_method(
                uri_cls,
                "parse",
                "(Ljava/lang/String;)Landroid/net/Uri;",
                &[jni::objects::JValue::Object(&uri_str)],
            )?
            .l()?;

        let action = if sdk_int >= 30 {
            "android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION"
        } else {
            "android.settings.APPLICATION_DETAILS_SETTINGS"
        };
        let action_str = env.new_string(action)?;
        let intent_cls = env.find_class("android/content/Intent")?;
        let intent = env.new_object(
            &intent_cls,
            "(Ljava/lang/String;Landroid/net/Uri;)V",
            &[
                jni::objects::JValue::Object(&action_str),
                jni::objects::JValue::Object(&uri_obj),
            ],
        )?;

        // FLAG_ACTIVITY_NEW_TASK = 0x10000000 (required when starting from Application context)
        let _ = env.call_method(
            &intent,
            "addFlags",
            "(I)Landroid/content/Intent;",
            &[jni::objects::JValue::Int(0x10000000)],
        )?;

        let start_res = env.call_method(
            &app_ctx,
            "startActivity",
            "(Landroid/content/Intent;)V",
            &[jni::objects::JValue::Object(&intent)],
        );

        if start_res.is_err() {
            let _ = env.exception_clear();
            if sdk_int >= 30 {
                let fallback_action =
                    env.new_string("android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION")?;
                let fallback_intent = env.new_object(
                    &intent_cls,
                    "(Ljava/lang/String;)V",
                    &[jni::objects::JValue::Object(&fallback_action)],
                )?;
                let _ = env.call_method(
                    &fallback_intent,
                    "addFlags",
                    "(I)Landroid/content/Intent;",
                    &[jni::objects::JValue::Int(0x10000000)],
                );
                env.call_method(
                    &app_ctx,
                    "startActivity",
                    "(Landroid/content/Intent;)V",
                    &[jni::objects::JValue::Object(&fallback_intent)],
                )?;
            }
        }

        Ok(())
    })
    .map_err(|e: jni::errors::Error| format!("open_android_all_files_settings failed: {}", e))
}

#[command]
pub fn check_storage_permission() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        check_android_all_files_access()
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(true)
    }
}

#[command]
pub fn request_storage_permission() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        open_android_all_files_settings()
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

#[command]
pub fn get_platform() -> &'static str {
    #[cfg(target_os = "android")]
    {
        "android"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(
        target_os = "android",
        target_os = "windows",
        target_os = "macos",
        target_os = "linux"
    )))]
    {
        "unknown"
    }
}

#[command]
pub fn trigger_admin_shortcut(app_handle: AppHandle, logger: State<'_, Logger>) -> Result<(), String> {
    logger.info("trigger_admin_shortcut invoked: emitting open-admin-panel event");
    app_handle
        .emit("open-admin-panel", ())
        .map_err(|e| format!("Failed to emit open-admin-panel event: {}", e))
}

#[command]
pub fn toggle_fullscreen(
    #[allow(unused_variables)] app_handle: AppHandle,
    logger: State<'_, Logger>,
) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        logger.info("toggle_fullscreen -> true (Android stays fullscreen)");
        Ok(true)
    }

    #[cfg(not(target_os = "android"))]
    {
        let window = app_handle
            .get_webview_window("main")
            .ok_or_else(|| "Main webview window not found".to_string())?;
        let current = window
            .is_fullscreen()
            .map_err(|e| format!("Failed to read fullscreen state: {}", e))?;
        let next = !current;
        window
            .set_fullscreen(next)
            .map_err(|e| format!("Failed to set fullscreen({}): {}", next, e))?;
        logger.info(&format!("toggle_fullscreen -> {}", next));
        Ok(next)
    }
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
