use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct Logger {
    log_dir: PathBuf,
    current_file: Mutex<PathBuf>,
}

impl Logger {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let app_data = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;

        let log_dir = app_data.join("logs");
        if !log_dir.exists() {
            fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create logs dir: {}", e))?;
        }

        let file_path = log_dir.join("kiosk.log");
        let logger = Self {
            log_dir,
            current_file: Mutex::new(file_path),
        };

        logger.rotate_if_needed();
        logger.info("Logger initialized");
        Ok(logger)
    }

    fn rotate_if_needed(&self) {
        let Ok(file_path) = self.current_file.lock() else {
            return;
        };

        if let Ok(metadata) = fs::metadata(&*file_path) {
            // Rotate if file size exceeds 5MB
            if metadata.len() > 5 * 1024 * 1024 {
                let backup = self.log_dir.join("kiosk.1.log");
                let _ = fs::rename(&*file_path, backup);
            }
        }
    }

    pub fn log(&self, level: &str, message: &str) {
        self.rotate_if_needed();
        let Ok(file_path) = self.current_file.lock() else {
            return;
        };

        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!("[{}] [{}] {}\n", now, level, message);

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&*file_path) {
            let _ = file.write_all(line.as_bytes());
        }
        eprint!("{}", line);
    }

    pub fn info(&self, message: &str) {
        self.log("INFO", message);
    }

    pub fn warn(&self, message: &str) {
        self.log("WARN", message);
    }

    pub fn error(&self, message: &str) {
        self.log("ERROR", message);
    }
}
