use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::Manager;

use crate::config::ConfigService;
use crate::logger::Logger;
use crate::media::media_extensions;

/// Maximum slice size (4 MiB) served in a single open-ended 206 Range response
/// so large MP4 files are streamed in chunks and never loaded wholly into memory.
const MAX_RANGE_CHUNK_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64, // inclusive
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RangeParseResult {
    Valid(ByteRange),
    Unsatisfiable,
}

/// Percent-decodes a URI path segment, rejecting invalid UTF-8 or embedded NUL bytes.
pub fn percent_decode_path(raw: &str) -> Result<String, String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err("Incomplete percent-encoding in URI path".to_string());
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .map_err(|_| "Invalid UTF-8 in percent-encoding".to_string())?;
            let val = u8::from_str_radix(hex, 16)
                .map_err(|_| "Invalid hex digits in percent-encoding".to_string())?;
            if val == 0 {
                return Err("NUL byte rejected in URI path".to_string());
            }
            out.push(val);
            i += 3;
        } else {
            if bytes[i] == 0 {
                return Err("NUL byte rejected in URI path".to_string());
            }
            out.push(bytes[i]);
            i += 1;
        }
    }

    String::from_utf8(out).map_err(|_| "Decoded URI path is not valid UTF-8".to_string())
}

/// Resolves and jails a requested URI path to `media_root`:
/// - Rejects empty paths (no directory listing)
/// - Rejects `..`, backslashes, colons/drive switches, UNC prefixes, subdirectories
/// - Enforces allow-listed extensions (`mp4`, `png`, `jpg`, `jpeg`)
/// - Canonicalizes both root and target file to defeat symlink escapes
pub fn resolve_jailed_media_path(media_root: &Path, raw_uri_path: &str) -> Result<PathBuf, (StatusCode, String)> {
    let trimmed = raw_uri_path.trim_start_matches('/');
    if trimmed.is_empty() {
        return Err((StatusCode::FORBIDDEN, "Directory listing is not allowed".to_string()));
    }

    let decoded = percent_decode_path(trimmed)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    if decoded.is_empty()
        || decoded.contains("..")
        || decoded.contains('/')
        || decoded.contains('\\')
        || decoded.contains(':')
        || decoded.starts_with("//")
        || decoded.starts_with("\\\\")
    {
        return Err((StatusCode::FORBIDDEN, format!("Path traversal or invalid path rejected: '{}'", decoded)));
    }

    let rel = Path::new(&decoded);
    let mut components = rel.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => {
            return Err((StatusCode::FORBIDDEN, "Only single-segment root filenames are allowed".to_string()));
        }
    }

    let ext_lower = rel
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if !media_extensions::is_allowed_media_ext(&ext_lower) {
        return Err((StatusCode::FORBIDDEN, format!("File extension '.{}' is not allow-listed", ext_lower)));
    }

    let canonical_root = fs::canonicalize(media_root)
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Media root unavailable: {}", e)))?;

    let candidate = canonical_root.join(rel);
    let canonical_file = fs::canonicalize(&candidate)
        .map_err(|_| (StatusCode::NOT_FOUND, "Media file not found".to_string()))?;

    if !canonical_file.starts_with(&canonical_root) {
        return Err((StatusCode::FORBIDDEN, "Symlink or path escape outside media root rejected".to_string()));
    }

    if !canonical_file.is_file() {
        return Err((StatusCode::FORBIDDEN, "Requested target is not a regular file".to_string()));
    }

    Ok(canonical_file)
}

pub fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

/// Parses an HTTP `Range: bytes=...` header against `total_len`.
/// Supports `bytes=a-b`, `bytes=a-`, and `bytes=-n`.
pub fn parse_range_header(range_header: &str, total_len: u64) -> RangeParseResult {
    if total_len == 0 {
        return RangeParseResult::Unsatisfiable;
    }

    let Some(spec) = range_header.trim().strip_prefix("bytes=") else {
        return RangeParseResult::Unsatisfiable;
    };

    // Reject multi-range for simplicity/safety; take only single range
    if spec.contains(',') {
        return RangeParseResult::Unsatisfiable;
    }

    let Some((start_str, end_str)) = spec.split_once('-') else {
        return RangeParseResult::Unsatisfiable;
    };

    let start_str = start_str.trim();
    let end_str = end_str.trim();

    if start_str.is_empty() {
        // Suffix byte range: bytes=-n
        let Ok(suffix_len) = end_str.parse::<u64>() else {
            return RangeParseResult::Unsatisfiable;
        };
        if suffix_len == 0 {
            return RangeParseResult::Unsatisfiable;
        }
        let start = total_len.saturating_sub(suffix_len);
        let end = total_len - 1;
        let capped_end = end.min(start + MAX_RANGE_CHUNK_BYTES - 1);
        RangeParseResult::Valid(ByteRange { start, end: capped_end })
    } else {
        let Ok(start) = start_str.parse::<u64>() else {
            return RangeParseResult::Unsatisfiable;
        };
        if start >= total_len {
            return RangeParseResult::Unsatisfiable;
        }

        let end = if end_str.is_empty() {
            // Open-ended: bytes=a- -> serve up to MAX_RANGE_CHUNK_BYTES
            (total_len - 1).min(start + MAX_RANGE_CHUNK_BYTES - 1)
        } else {
            let Ok(parsed_end) = end_str.parse::<u64>() else {
                return RangeParseResult::Unsatisfiable;
            };
            if parsed_end < start {
                return RangeParseResult::Unsatisfiable;
            }
            parsed_end.min(total_len - 1)
        };

        RangeParseResult::Valid(ByteRange { start, end })
    }
}

fn error_response(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Core handler used by `register_uri_scheme_protocol("kiosk-media", ...)` and unit tests.
pub fn handle_media_request(
    media_root: &Path,
    request: &Request<Vec<u8>>,
    logger: Option<&Logger>,
) -> Response<Vec<u8>> {
    if request.method() != Method::GET {
        return error_response(StatusCode::METHOD_NOT_ALLOWED, "Only GET is allowed");
    }

    let file_path = match resolve_jailed_media_path(media_root, request.uri().path()) {
        Ok(p) => p,
        Err((status, reason)) => {
            if status == StatusCode::FORBIDDEN
                && let Some(l) = logger
            {
                l.warn(&format!("kiosk-media:// blocked request '{}': {}", request.uri().path(), reason));
            }
            return error_response(status, &reason);
        }
    };

    let mut file = match File::open(&file_path) {
        Ok(f) => f,
        Err(e) => {
            return error_response(StatusCode::NOT_FOUND, &format!("Failed to open file: {}", e));
        }
    };

    let total_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(e) => {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("Metadata error: {}", e));
        }
    };

    let content_type = content_type_for_path(&file_path);

    if let Some(range_val) = request.headers().get(header::RANGE).and_then(|v| v.to_str().ok()) {
        match parse_range_header(range_val, total_len) {
            RangeParseResult::Valid(range) => {
                let slice_len = (range.end - range.start + 1) as usize;
                if let Err(e) = file.seek(SeekFrom::Start(range.start)) {
                    return error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("Seek error: {}", e));
                }

                let mut buf = vec![0u8; slice_len];
                if let Err(e) = file.read_exact(&mut buf) {
                    return error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("Read error: {}", e));
                }

                Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_TYPE, content_type)
                    .header(header::ACCEPT_RANGES, "bytes")
                    .header(header::CONTENT_LENGTH, slice_len.to_string())
                    .header(
                        header::CONTENT_RANGE,
                        format!("bytes {}-{}/{}", range.start, range.end, total_len),
                    )
                    .body(buf)
                    .unwrap_or_else(|_| Response::new(Vec::new()))
            }
            RangeParseResult::Unsatisfiable => Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{}", total_len))
                .body(Vec::new())
                .unwrap_or_else(|_| Response::new(Vec::new())),
        }
    } else {
        // Non-range GET (e.g. PNG/JPG thumbnails or small files)
        let mut buf = Vec::with_capacity(total_len as usize);
        if let Err(e) = file.read_to_end(&mut buf) {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("Read error: {}", e));
        }

        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, total_len.to_string())
            .body(buf)
            .unwrap_or_else(|_| Response::new(Vec::new()))
    }
}

pub fn register_kiosk_media_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.register_uri_scheme_protocol("kiosk-media", |ctx, request| {
        let app_handle = ctx.app_handle();
        let logger = app_handle.try_state::<Logger>();
        let media_root = match app_handle.try_state::<ConfigService>() {
            Some(cfg_svc) => match cfg_svc.get_config() {
                Ok(cfg) => PathBuf::from(cfg.kiosk_media_root),
                Err(e) => {
                    return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
                }
            },
            None => {
                return error_response(StatusCode::SERVICE_UNAVAILABLE, "ConfigService not initialized");
            }
        };

        handle_media_request(&media_root, &request, logger.as_deref())
    })
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
        let dir = std::env::temp_dir().join(format!("kiosk_proto_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_req(method: Method, uri: &str, range: Option<&str>) -> Request<Vec<u8>> {
        let mut b = Request::builder().method(method).uri(uri);
        if let Some(r) = range {
            b = b.header(header::RANGE, r);
        }
        b.body(Vec::new()).unwrap()
    }

    #[test]
    fn test_path_jail_rejects_traversal_unc_drives_and_bad_extensions() {
        let tmp = make_temp_dir("jail");
        fs::write(tmp.join("valid.mp4"), b"0123456789").unwrap();
        fs::write(tmp.join("bad.mpg"), b"nope").unwrap();
        fs::create_dir_all(tmp.join("sub")).unwrap();
        fs::write(tmp.join("sub/nested.mp4"), b"nested").unwrap();

        let bad_paths = [
            "/",
            "/..%2fsecret.mp4",
            "/..%5Csecret.mp4",
            "/..\\secret.mp4",
            "/C:/Windows/win.ini",
            "/C%3A/Windows/win.ini",
            "//server/share/a.mp4",
            "/sub/nested.mp4",
            "/bad.mpg",
            "/script.exe",
            "/%00valid.mp4",
        ];

        for path in bad_paths {
            let res = resolve_jailed_media_path(&tmp, path);
            assert!(res.is_err(), "Expected rejection for path: {}", path);
            let (status, _) = res.unwrap_err();
            assert!(
                status == StatusCode::FORBIDDEN || status == StatusCode::BAD_REQUEST,
                "Unexpected status {} for path {}",
                status,
                path
            );
        }

        assert!(resolve_jailed_media_path(&tmp, "/valid.mp4").is_ok());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_rejects_non_get_methods() {
        let tmp = make_temp_dir("method");
        fs::write(tmp.join("clip.mp4"), b"data").unwrap();

        let req = make_req(Method::POST, "http://kiosk-media.localhost/clip.mp4", None);
        let resp = handle_media_request(&tmp, &req, None);
        assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_range_header_parsing() {
        assert_eq!(
            parse_range_header("bytes=0-9", 100),
            RangeParseResult::Valid(ByteRange { start: 0, end: 9 })
        );
        assert_eq!(
            parse_range_header("bytes=50-", 100),
            RangeParseResult::Valid(ByteRange { start: 50, end: 99 })
        );
        assert_eq!(
            parse_range_header("bytes=-20", 100),
            RangeParseResult::Valid(ByteRange { start: 80, end: 99 })
        );
        assert_eq!(
            parse_range_header("bytes=0-0", 100),
            RangeParseResult::Valid(ByteRange { start: 0, end: 0 })
        );
        assert_eq!(parse_range_header("bytes=100-", 100), RangeParseResult::Unsatisfiable);
        assert_eq!(parse_range_header("bytes=50-10", 100), RangeParseResult::Unsatisfiable);
        assert_eq!(parse_range_header("bytes=-0", 100), RangeParseResult::Unsatisfiable);
    }

    #[test]
    fn test_http_200_206_416_and_headers() {
        let tmp = make_temp_dir("range_http");
        let payload = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 26 bytes
        fs::write(tmp.join("Space Video.mp4"), payload).unwrap();
        fs::write(tmp.join("thumb.png"), b"PNGDATA").unwrap();

        // 200 OK without Range (percent-encoded space)
        let req_200 = make_req(Method::GET, "http://kiosk-media.localhost/Space%20Video.mp4", None);
        let resp_200 = handle_media_request(&tmp, &req_200, None);
        assert_eq!(resp_200.status(), StatusCode::OK);
        assert_eq!(resp_200.headers().get(header::CONTENT_TYPE).unwrap(), "video/mp4");
        assert_eq!(resp_200.headers().get(header::ACCEPT_RANGES).unwrap(), "bytes");
        assert_eq!(resp_200.headers().get(header::CONTENT_LENGTH).unwrap(), "26");
        assert_eq!(resp_200.body(), payload);

        // 206 Partial Content: bytes=2-5 -> "CDEF"
        let req_206 = make_req(
            Method::GET,
            "http://kiosk-media.localhost/Space%20Video.mp4",
            Some("bytes=2-5"),
        );
        let resp_206 = handle_media_request(&tmp, &req_206, None);
        assert_eq!(resp_206.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp_206.headers().get(header::CONTENT_RANGE).unwrap(), "bytes 2-5/26");
        assert_eq!(resp_206.headers().get(header::CONTENT_LENGTH).unwrap(), "4");
        assert_eq!(resp_206.body(), b"CDEF");

        // 416 Range Not Satisfiable
        let req_416 = make_req(
            Method::GET,
            "http://kiosk-media.localhost/Space%20Video.mp4",
            Some("bytes=999-"),
        );
        let resp_416 = handle_media_request(&tmp, &req_416, None);
        assert_eq!(resp_416.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(resp_416.headers().get(header::CONTENT_RANGE).unwrap(), "bytes */26");

        // PNG Content-Type
        let req_png = make_req(Method::GET, "http://kiosk-media.localhost/thumb.png", None);
        let resp_png = handle_media_request(&tmp, &req_png, None);
        assert_eq!(resp_png.status(), StatusCode::OK);
        assert_eq!(resp_png.headers().get(header::CONTENT_TYPE).unwrap(), "image/png");

        let _ = fs::remove_dir_all(&tmp);
    }
}
