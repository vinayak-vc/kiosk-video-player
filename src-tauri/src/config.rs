use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
