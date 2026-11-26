pub mod config;
pub mod media;
pub mod protocol;
pub mod watcher;
pub mod window;
pub mod logger;
pub mod commands;

use tauri::Manager;
use config::ConfigService;
use logger::Logger;
use watcher::MediaWatcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = protocol::register_kiosk_media_protocol(tauri::Builder::default());
    #[cfg(not(target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    builder
        .setup(|app| {
            let app_handle = app.handle().clone();
            let logger = match Logger::new(&app_handle) {
                Ok(l) => l,
                Err(err) => {
                    eprintln!("[FATAL] Failed to initialize logger: {}", err);
                    return Err(Box::new(std::io::Error::other(err)));
                }
            };

            let initial_media_root = match ConfigService::init(&app_handle, &logger) {
                Ok(cfg_service) => {
                    let root = cfg_service
                        .get_config()
                        .map(|c| std::path::PathBuf::from(c.kiosk_media_root))
                        .unwrap_or_else(|_| std::path::PathBuf::from(config::default_media_root()));
                    app.manage(cfg_service);
                    root
                }
                Err(err) => {
                    logger.error(&format!("Failed to initialize ConfigService: {}", err));
                    return Err(Box::new(std::io::Error::other(err)));
                }
            };

            app.manage(logger);

            match MediaWatcher::start_tauri(app_handle.clone(), &initial_media_root) {
                Ok(media_watcher) => {
                    app.manage(media_watcher);
                }
                Err(err) => {
                    if let Some(l) = app_handle.try_state::<Logger>() {
                        l.warn(&format!(
                            "MediaWatcher failed to start (running in degraded manual-rescan mode): {}",
                            err
                        ));
                    } else {
                        eprintln!("[WARN] MediaWatcher failed to start: {}", err);
                    }
                }
            }

            if let Err(err) = window::setup_kiosk_window(&app_handle) {
                eprintln!("[ERROR] Kiosk window configuration failed: {}", err);
                return Err(Box::new(std::io::Error::other(err)));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_media_root,
            commands::pick_media_folder,
            commands::validate_media_folder_cmd,
            commands::get_media_items,
            commands::log_client_message,
            commands::exit_kiosk_app,
            commands::trigger_admin_shortcut,
            commands::toggle_fullscreen,
            commands::get_platform,
            commands::check_storage_permission,
            commands::request_storage_permission,
            commands::write_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
