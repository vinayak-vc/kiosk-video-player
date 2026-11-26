use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Isolated media extension constants (single source of truth).
/// Note: `.mpg` is intentionally NOT an image extension.
pub mod media_extensions {
    pub const VIDEO_EXTENSIONS: &[&str] = &["mp4"];
    /// Ordered from highest priority (index 0) to lowest.
    pub const IMAGE_EXTENSIONS_PRIORITY: &[&str] = &["png", "jpg", "jpeg"];

    pub fn is_video_ext(ext_lower: &str) -> bool {
        VIDEO_EXTENSIONS.contains(&ext_lower)
    }

    pub fn image_priority(ext_lower: &str) -> Option<usize> {
        IMAGE_EXTENSIONS_PRIORITY
            .iter()
            .position(|&candidate| candidate == ext_lower)
    }

    pub fn is_allowed_media_ext(ext_lower: &str) -> bool {
        is_video_ext(ext_lower) || image_priority(ext_lower).is_some()
    }
}

pub const RESERVED_SCREENSAVER_STEM: &str = "screensaver";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScreensaverInfo {
    pub video_path: String,
    pub video_url: String,
    pub file_size: u64,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScanResult {
    pub items: Vec<MediaItem>,
    pub screensaver: Option<ScreensaverInfo>,
    pub ignored_orphan_count: usize,
    pub video_count: usize,
    pub image_count: usize,
    pub errors: Vec<String>,
    pub root: String,
}

/// Pure representation of a directory entry so PairMatcher needs no disk I/O.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirEntryInfo {
    pub file_name: String,
    pub full_path: String,
    pub is_dir: bool,
    pub file_size: u64,
}

/// Percent-encodes a filename for use in `http://kiosk-media.localhost/<filename>`.
pub fn percent_encode_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for byte in name.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    out
}

pub fn build_media_url(filename: &str) -> String {
    format!("http://kiosk-media.localhost/{}", percent_encode_filename(filename))
}

/// Natural, case-insensitive comparator (e.g. `1, 2, 3, 10, 11`).
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let mut i = 0;
    let mut j = 0;

    while i < a_bytes.len() && j < b_bytes.len() {
        let a_is_digit = a_bytes[i].is_ascii_digit();
        let b_is_digit = b_bytes[j].is_ascii_digit();

        if a_is_digit && b_is_digit {
            let a_start = i;
            while i < a_bytes.len() && a_bytes[i].is_ascii_digit() {
                i += 1;
            }
            let b_start = j;
            while j < b_bytes.len() && b_bytes[j].is_ascii_digit() {
                j += 1;
            }

            let a_num = a[a_start..i].trim_start_matches('0');
            let b_num = b[b_start..j].trim_start_matches('0');

            match a_num.len().cmp(&b_num.len()) {
                Ordering::Equal => match a_num.cmp(b_num) {
                    Ordering::Equal => {
                        // Fewer leading zeros first if numerically equal (e.g. "2" vs "02")
                        let a_total_len = i - a_start;
                        let b_total_len = j - b_start;
                        if a_total_len != b_total_len {
                            return a_total_len.cmp(&b_total_len);
                        }
                    }
                    non_eq => return non_eq,
                },
                non_eq => return non_eq,
            }
        } else {
            let a_ch = a[i..].chars().next().unwrap();
            let b_ch = b[j..].chars().next().unwrap();
            let a_low = a_ch.to_ascii_lowercase();
            let b_low = b_ch.to_ascii_lowercase();

            if a_low != b_low {
                return a_low.cmp(&b_low);
            }
            i += a_ch.len_utf8();
            j += b_ch.len_utf8();
        }
    }

    match a_bytes.len().cmp(&b_bytes.len()) {
        Ordering::Equal => a.cmp(b),
        non_eq => non_eq,
    }
}

fn split_stem_and_ext(file_name: &str) -> Option<(&str, String)> {
    let dot_idx = file_name.rfind('.')?;
    if dot_idx == 0 || dot_idx + 1 >= file_name.len() {
        return None;
    }
    let stem = &file_name[..dot_idx];
    let ext_lower = file_name[dot_idx + 1..].to_ascii_lowercase();
    Some((stem, ext_lower))
}

#[derive(Debug, Clone)]
struct CandidateImage<'a> {
    priority: usize,
    entry: &'a DirEntryInfo,
}

/// Pure PairMatcher: transforms directory entries (root-only) into a sorted `ScanResult`.
pub fn match_media_entries(entries: &[DirEntryInfo], root: &str, initial_errors: Vec<String>) -> ScanResult {
    // Sort input entries deterministically (case-insensitive natural order, then exact name)
    let mut sorted_entries: Vec<&DirEntryInfo> = entries.iter().filter(|e| !e.is_dir).collect();
    sorted_entries.sort_by(|a, b| natural_cmp(&a.file_name, &b.file_name));

    let mut videos_by_key: HashMap<String, (&str, &DirEntryInfo)> = HashMap::new();
    let mut best_image_by_key: HashMap<String, CandidateImage<'_>> = HashMap::new();
    let mut screensaver: Option<ScreensaverInfo> = None;
    let mut duplicate_video_orphans: usize = 0;
    let mut video_count: usize = 0;
    let mut image_count: usize = 0;

    for entry in sorted_entries {
        let Some((stem, ext_lower)) = split_stem_and_ext(&entry.file_name) else {
            continue;
        };
        let key = stem.to_ascii_lowercase();

        if key == RESERVED_SCREENSAVER_STEM {
            if media_extensions::is_video_ext(&ext_lower) && screensaver.is_none() {
                screensaver = Some(ScreensaverInfo {
                    video_path: entry.full_path.clone(),
                    video_url: build_media_url(&entry.file_name),
                    file_size: entry.file_size,
                });
            }
            // Reserved screensaver video and any companion image are never gallery cards or orphans.
            continue;
        }

        if media_extensions::is_video_ext(&ext_lower) {
            video_count += 1;
            if let std::collections::hash_map::Entry::Vacant(e) = videos_by_key.entry(key) {
                e.insert((stem, entry));
            } else {
                // Two videos differing only by case on case-sensitive fs:
                // keep the first by sorted name, count the duplicate as ignored orphan.
                duplicate_video_orphans += 1;
            }
        } else if let Some(priority) = media_extensions::image_priority(&ext_lower) {
            image_count += 1;
            match best_image_by_key.get(&key) {
                Some(existing) if existing.priority <= priority => {}
                _ => {
                    best_image_by_key.insert(key, CandidateImage { priority, entry });
                }
            }
        }
    }

    let mut items = Vec::new();
    let mut orphan_videos: usize = 0;

    for (key, (stem, video_entry)) in &videos_by_key {
        if let Some(img) = best_image_by_key.get(key) {
            items.push(MediaItem {
                id: key.clone(),
                filename: video_entry.file_name.clone(),
                display_title: (*stem).to_string(),
                video_path: video_entry.full_path.clone(),
                thumbnail_path: img.entry.full_path.clone(),
                video_url: build_media_url(&video_entry.file_name),
                thumbnail_url: build_media_url(&img.entry.file_name),
                file_size: video_entry.file_size,
            });
        } else {
            orphan_videos += 1;
        }
    }

    // Orphan images = image basenames that had no matching video
    let orphan_images = best_image_by_key
        .keys()
        .filter(|key| !videos_by_key.contains_key(*key))
        .count();

    items.sort_by(|a, b| natural_cmp(&a.display_title, &b.display_title));

    ScanResult {
        items,
        screensaver,
        ignored_orphan_count: orphan_videos + duplicate_video_orphans + orphan_images,
        video_count,
        image_count,
        errors: initial_errors,
        root: root.to_string(),
    }
}

/// Maximum directory entries processed per scan to prevent unbounded memory growth.
pub const MAX_ENTRIES: usize = 20_000;

pub struct MediaScanner;

impl MediaScanner {
    /// Scans the root directory (non-recursive) and matches `<basename>.mp4` + thumbnail pairs.
    /// Never panics on unreadable directories or malformed entries; errors are returned in `ScanResult.errors`.
    pub fn scan_directory(root: &Path) -> ScanResult {
        let root_str = root.to_string_lossy().to_string();
        let read_dir = match fs::read_dir(root) {
            Ok(rd) => rd,
            Err(e) => {
                return ScanResult {
                    items: Vec::new(),
                    screensaver: None,
                    ignored_orphan_count: 0,
                    video_count: 0,
                    image_count: 0,
                    errors: vec![format!("Failed to read media directory '{}': {}", root_str, e)],
                    root: root_str,
                };
            }
        };

        let mut entries = Vec::new();
        let mut errors = Vec::new();

        for entry_res in read_dir {
            if entries.len() >= MAX_ENTRIES {
                errors.push(format!(
                    "Folder has too many entries (limit {}); scan truncated",
                    MAX_ENTRIES
                ));
                break;
            }
            match entry_res {
                Ok(entry) => {
                    let path = entry.path();
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(e) => {
                            errors.push(format!("Failed to read metadata for '{}': {}", file_name, e));
                            continue;
                        }
                    };
                    entries.push(DirEntryInfo {
                        file_name,
                        full_path: path.to_string_lossy().to_string(),
                        is_dir: meta.is_dir(),
                        file_size: meta.len(),
                    });
                }
                Err(e) => {
                    errors.push(format!("Failed to read directory entry: {}", e));
                }
            }
        }

        match_media_entries(&entries, &root_str, errors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn entry(name: &str, is_dir: bool, size: u64) -> DirEntryInfo {
        DirEntryInfo {
            file_name: name.to_string(),
            full_path: format!("C:/Media/{}", name),
            is_dir,
            file_size: size,
        }
    }

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("kiosk_media_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_valid_pair_and_title_and_urls() {
        let entries = vec![
            entry("Space Exploration.mp4", false, 2048),
            entry("Space Exploration.png", false, 512),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.ignored_orphan_count, 0);
        assert!(res.errors.is_empty());

        let item = &res.items[0];
        assert_eq!(item.id, "space exploration");
        assert_eq!(item.filename, "Space Exploration.mp4");
        assert_eq!(item.display_title, "Space Exploration");
        assert_eq!(item.file_size, 2048);
        assert_eq!(item.video_url, "http://kiosk-media.localhost/Space%20Exploration.mp4");
        assert_eq!(item.thumbnail_url, "http://kiosk-media.localhost/Space%20Exploration.png");
    }

    #[test]
    fn test_missing_image_and_missing_video_counted_as_orphans() {
        let entries = vec![
            entry("only_video.mp4", false, 100),
            entry("only_image.jpg", false, 50),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert!(res.items.is_empty());
        assert_eq!(res.ignored_orphan_count, 2);
    }

    #[test]
    fn test_case_insensitive_pair_matching() {
        let entries = vec![
            entry("A.MP4", false, 1024),
            entry("a.PNG", false, 256),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.ignored_orphan_count, 0);
        assert_eq!(res.items[0].id, "a");
        assert_eq!(res.items[0].display_title, "A");
    }

    #[test]
    fn test_duplicate_case_videos_deterministic_and_counted() {
        let entries = vec![
            entry("demo.mp4", false, 100),
            entry("DEMO.MP4", false, 200),
            entry("demo.png", false, 50),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        // "DEMO.MP4" sorts before "demo.mp4" by exact tie-breaker
        assert_eq!(res.items[0].filename, "DEMO.MP4");
        assert_eq!(res.ignored_orphan_count, 1);
    }

    #[test]
    fn test_multiple_thumbnails_priority_png_over_jpg_over_jpeg() {
        let entries = vec![
            entry("hero.mp4", false, 500),
            entry("hero.jpeg", false, 10),
            entry("hero.jpg", false, 20),
            entry("hero.png", false, 30),
            entry("second.mp4", false, 500),
            entry("second.jpeg", false, 10),
            entry("second.jpg", false, 20),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 2);
        assert_eq!(res.items[0].thumbnail_path, "C:/Media/hero.png");
        assert_eq!(res.items[1].thumbnail_path, "C:/Media/second.jpg");
    }

    #[test]
    fn test_natural_sort_order() {
        let mut entries = Vec::new();
        for name in ["10", "2", "1", "11", "3"] {
            entries.push(entry(&format!("{}.mp4", name), false, 100));
            entries.push(entry(&format!("{}.png", name), false, 10));
        }
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        let titles: Vec<&str> = res.items.iter().map(|i| i.display_title.as_str()).collect();
        assert_eq!(titles, vec!["1", "2", "3", "10", "11"]);
    }

    #[test]
    fn test_unsupported_formats_and_directories_ignored() {
        let entries = vec![
            entry("subdir", true, 0),
            entry("subdir.mp4", true, 0),
            entry("clip.avi", false, 100),
            entry("clip.mov", false, 100),
            entry("poster.mpg", false, 100), // .mpg is NOT an image extension
            entry("notes.txt", false, 10),
            entry("orphan.mp4", false, 100), // has .mpg with same stem -> still orphan!
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert!(res.items.is_empty());
        assert_eq!(res.ignored_orphan_count, 1); // only orphan.mp4
    }

    #[test]
    fn test_scan_directory_on_disk_empty_and_populated_temp_dir() {
        let tmp = make_temp_dir("disk_scan");

        // Empty dir
        let empty_res = MediaScanner::scan_directory(&tmp);
        assert!(empty_res.items.is_empty());
        assert_eq!(empty_res.ignored_orphan_count, 0);
        assert!(empty_res.errors.is_empty());

        // Populate with nested dir (ignored), valid pair, and orphan
        fs::create_dir_all(tmp.join("nested")).unwrap();
        fs::write(tmp.join("nested/inner.mp4"), b"x").unwrap();
        fs::write(tmp.join("nested/inner.png"), b"y").unwrap();
        fs::write(tmp.join("Video 2.mp4"), b"12345").unwrap();
        fs::write(tmp.join("video 2.jpg"), b"img").unwrap();
        fs::write(tmp.join("Video 10.mp4"), b"123456").unwrap();
        fs::write(tmp.join("Video 10.png"), b"img").unwrap();
        fs::write(tmp.join("stray.png"), b"img").unwrap();

        let res = MediaScanner::scan_directory(&tmp);
        assert_eq!(res.items.len(), 2);
        assert_eq!(res.items[0].display_title, "Video 2");
        assert_eq!(res.items[1].display_title, "Video 10");
        assert_eq!(res.ignored_orphan_count, 1); // stray.png
        assert!(res.errors.is_empty());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_scan_nonexistent_directory_returns_error_without_panic() {
        let missing = PathBuf::from("C:/definitely_nonexistent_kiosk_media_dir_12345");
        let res = MediaScanner::scan_directory(&missing);
        assert!(res.items.is_empty());
        assert_eq!(res.errors.len(), 1);
    }

    #[test]
    fn test_ignored_orphan_count_with_orphan_image_video_and_unsupported() {
        let entries = vec![
            entry("paired.mp4", false, 100),
            entry("paired.jpg", false, 20),
            entry("orphan_vid.mp4", false, 100),
            entry("orphan_img.png", false, 20),
            entry("unsupported.avi", false, 100),
            entry("unsupported_thumb.mpg", false, 20),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        // Exact expected count: 1 orphan video + 1 orphan image = 2 (unsupported files not counted as orphans)
        assert_eq!(res.ignored_orphan_count, 2);
    }

    #[test]
    fn test_my_video_title_and_percent_encoded_url() {
        let entries = vec![
            entry("My Video.mp4", false, 4096),
            entry("my video.PNG", false, 512),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].display_title, "My Video");
        assert_eq!(res.items[0].video_url, "http://kiosk-media.localhost/My%20Video.mp4");
        assert_eq!(res.items[0].thumbnail_url, "http://kiosk-media.localhost/my%20video.PNG");
    }

    #[test]
    fn test_video_count_and_image_count_reported_accurately() {
        let vids_only = match_media_entries(
            &[entry("a.mp4", false, 10), entry("b.MP4", false, 20)],
            "C:/Media",
            vec![],
        );
        assert_eq!(vids_only.video_count, 2);
        assert_eq!(vids_only.image_count, 0);
        assert!(vids_only.items.is_empty());

        let imgs_only = match_media_entries(
            &[entry("a.png", false, 10), entry("b.jpeg", false, 20), entry("c.jpg", false, 30)],
            "C:/Media",
            vec![],
        );
        assert_eq!(imgs_only.video_count, 0);
        assert_eq!(imgs_only.image_count, 3);
        assert!(imgs_only.items.is_empty());
    }

    #[test]
    fn test_reserved_screensaver_excluded_from_items_and_orphans() {
        let entries = vec![
            entry("SCREENSAVER.MP4", false, 50_000),
            entry("Screensaver.png", false, 1_000),
            entry("Alpha.mp4", false, 20_000),
            entry("Alpha.png", false, 500),
        ];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].display_title, "Alpha");
        assert_eq!(res.ignored_orphan_count, 0);
        assert_eq!(res.video_count, 1);
        assert_eq!(res.image_count, 1);
        let ss = res.screensaver.expect("screensaver should be populated");
        assert_eq!(ss.video_url, "http://kiosk-media.localhost/SCREENSAVER.MP4");
        assert_eq!(ss.file_size, 50_000);
    }

    #[test]
    fn test_screensaver_only_directory_keeps_gallery_empty_with_screensaver_present() {
        let entries = vec![entry("Screensaver.mp4", false, 12_345)];
        let res = match_media_entries(&entries, "C:/Media", vec![]);
        assert!(res.items.is_empty());
        assert_eq!(res.ignored_orphan_count, 0);
        assert_eq!(res.video_count, 0);
        assert_eq!(res.image_count, 0);
        let ss = res.screensaver.expect("screensaver should be populated");
        assert_eq!(ss.video_url, "http://kiosk-media.localhost/Screensaver.mp4");
        assert_eq!(ss.file_size, 12_345);
    }
}
