use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaItem {
    pub id: String,
    pub filename: String,
    pub display_title: String,
    pub video_path: String,
    pub thumbnail_path: String,
    pub video_url: String,
    pub thumbnail_url: String,
    pub file_size: u64,
}
