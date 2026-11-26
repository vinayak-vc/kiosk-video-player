use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const DEFAULT_DEBOUNCE_MS: u64 = 500;

enum WatcherMsg {
    SetTarget(PathBuf),
    FsEvent(notify::Result<notify::Event>),
    Stop,
}

pub struct MediaWatcher {
    tx: Sender<WatcherMsg>,
    thread: Option<JoinHandle<()>>,
}

impl MediaWatcher {
    /// Starts a debounced folder watcher for `initial_root`.
    /// Calls `on_change` once per burst of filesystem events after `debounce_ms`.
    pub fn start<F, L>(
        initial_root: &Path,
        debounce_ms: u64,
        on_change: F,
        on_log: L,
    ) -> Result<Self, String>
    where
        F: Fn() + Send + 'static,
        L: Fn(&str, &str) + Send + 'static,
    {
        let (tx, rx) = mpsc::channel::<WatcherMsg>();
        let fs_tx = tx.clone();

        let mut watcher: RecommendedWatcher =
            notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                let _ = fs_tx.send(WatcherMsg::FsEvent(res));
            })
            .map_err(|e| format!("Failed to create filesystem watcher: {}", e))?;

        let debounce = Duration::from_millis(debounce_ms);
        let initial = initial_root.to_path_buf();

        let thread = thread::spawn(move || {
            let mut current_target: Option<PathBuf> = None;

            let apply_target = |watcher: &mut RecommendedWatcher,
                                current: &mut Option<PathBuf>,
                                next: PathBuf,
                                log: &L| {
                if let Some(old) = current.take() {
                    let _ = watcher.unwatch(&old);
                }
                if !next.exists() || !next.is_dir() {
                    log(
                        "WARN",
                        &format!(
                            "MediaWatcher target does not exist or is not a directory: {:?}",
                            next
                        ),
                    );
                    return;
                }
                match watcher.watch(&next, RecursiveMode::NonRecursive) {
                    Ok(()) => {
                        log("INFO", &format!("MediaWatcher watching {:?}", next));
                        *current = Some(next);
                    }
                    Err(e) => {
                        log(
                            "WARN",
                            &format!("MediaWatcher failed to watch {:?}: {}", next, e),
                        );
                    }
                }
            };

            apply_target(&mut watcher, &mut current_target, initial, &on_log);

            let mut pending_deadline: Option<Instant> = None;

            loop {
                let timeout = match pending_deadline {
                    Some(deadline) => deadline.saturating_duration_since(Instant::now()),
                    None => Duration::from_secs(60),
                };

                match rx.recv_timeout(timeout) {
                    Ok(WatcherMsg::SetTarget(new_root)) => {
                        pending_deadline = None;
                        apply_target(&mut watcher, &mut current_target, new_root, &on_log);
                    }
                    Ok(WatcherMsg::FsEvent(Ok(event))) => {
                        if !matches!(event.kind, EventKind::Access(_)) {
                            pending_deadline = Some(Instant::now() + debounce);
                        }
                    }
                    Ok(WatcherMsg::FsEvent(Err(err))) => {
                        // Survives watched folder deletion or transient OS errors without crashing
                        on_log(
                            "WARN",
                            &format!("MediaWatcher received fs error (continuing): {}", err),
                        );
                    }
                    Ok(WatcherMsg::Stop) => {
                        if let Some(old) = current_target.take() {
                            let _ = watcher.unwatch(&old);
                        }
                        break;
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if let Some(deadline) = pending_deadline
                            && Instant::now() >= deadline
                        {
                            pending_deadline = None;
                            on_change();
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(Self {
            tx,
            thread: Some(thread),
        })
    }

    /// Starts a `MediaWatcher` wired to Tauri's `"media-changed"` event.
    pub fn start_tauri(app_handle: AppHandle, initial_root: &Path) -> Result<Self, String> {
        let emit_handle = app_handle.clone();
        let log_handle = app_handle;
        Self::start(
            initial_root,
            DEFAULT_DEBOUNCE_MS,
            move || {
                if let Err(e) = emit_handle.emit("media-changed", ()) {
                    eprintln!("[WARN] Failed to emit media-changed event: {}", e);
                }
            },
            move |level, msg| {
                use tauri::Manager;
                if let Some(logger) = log_handle.try_state::<crate::logger::Logger>() {
                    logger.log(level, msg);
                }
            },
        )
    }

    /// Re-targets the watcher to a new media root folder.
    pub fn set_target(&self, new_root: &Path) -> Result<(), String> {
        self.tx
            .send(WatcherMsg::SetTarget(new_root.to_path_buf()))
            .map_err(|e| format!("Failed to send SetTarget to MediaWatcher: {}", e))
    }
}

impl Drop for MediaWatcher {
    fn drop(&mut self) {
        let _ = self.tx.send(WatcherMsg::Stop);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("kiosk_watch_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_debounced_watcher_emits_and_retargets_and_survives_deletion() {
        let dir_a = make_temp_dir("a");
        let dir_b = make_temp_dir("b");

        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = Arc::clone(&count);

        let watcher = MediaWatcher::start(
            &dir_a,
            150,
            move || {
                count_clone.fetch_add(1, Ordering::SeqCst);
            },
            |_lvl, _msg| {},
        )
        .unwrap();

        // Give OS watcher a moment to register
        thread::sleep(Duration::from_millis(100));

        // Burst of 3 writes should debounce into 1 callback
        fs::write(dir_a.join("1.mp4"), b"a").unwrap();
        fs::write(dir_a.join("1.png"), b"b").unwrap();
        fs::write(dir_a.join("2.mp4"), b"c").unwrap();

        thread::sleep(Duration::from_millis(450));
        assert_eq!(count.load(Ordering::SeqCst), 1, "Burst should debounce to 1 event");

        // Retarget to dir_b
        watcher.set_target(&dir_b).unwrap();
        thread::sleep(Duration::from_millis(100));

        // Write in dir_a should no longer trigger
        fs::write(dir_a.join("ignored.mp4"), b"x").unwrap();
        thread::sleep(Duration::from_millis(300));
        assert_eq!(count.load(Ordering::SeqCst), 1);

        // Write in dir_b should trigger
        fs::write(dir_b.join("new.mp4"), b"y").unwrap();
        thread::sleep(Duration::from_millis(450));
        assert_eq!(count.load(Ordering::SeqCst), 2);

        // Deleting watched folder dir_b must not panic/crash
        fs::remove_dir_all(&dir_b).unwrap();
        thread::sleep(Duration::from_millis(200));

        drop(watcher);
        let _ = fs::remove_dir_all(&dir_a);
    }
}
