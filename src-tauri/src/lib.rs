pub mod config;
pub mod media;
pub mod watcher;
pub mod window;
pub mod logger;
pub mod commands;

use tauri::Manager;
use logger::Logger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            if let Ok(logger) = Logger::new(&app_handle) {
                app.manage(logger);
            }
            let _ = window::setup_kiosk_window(&app_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_config,
            commands::get_media_items,
            commands::log_client_message,
            commands::exit_kiosk_app,
            commands::trigger_admin_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
