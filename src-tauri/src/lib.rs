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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = protocol::register_kiosk_media_protocol(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init());
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

            match ConfigService::init(&app_handle, &logger) {
                Ok(cfg_service) => {
                    app.manage(cfg_service);
                }
                Err(err) => {
                    logger.error(&format!("Failed to initialize ConfigService: {}", err));
                    return Err(Box::new(std::io::Error::other(err)));
                }
            }

            app.manage(logger);

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
            commands::trigger_admin_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
