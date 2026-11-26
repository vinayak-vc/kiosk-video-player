use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const DEFAULT_DEBOUNCE_MS: u64 = 500;
pub const DEFAULT_REATTACH_POLL_MS: u64 = 2000;

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
    /// Starts a debounced folder watcher for `initial_root` with automatic poll-and-reattach
    /// if the watched directory is deleted/unplugged and later recreated/remounted.
    pub fn start_with_intervals<F, L>(
        initial_root: &Path,
        debounce_ms: u64,
        reattach_poll_ms: u64,
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
        let poll_interval = Duration::from_millis(reattach_poll_ms);
        let initial = initial_root.to_path_buf();

        let thread = thread::spawn(move || {
            let mut desired_target = initial;

            let try_attach = |watcher: &mut RecommendedWatcher, target: &Path, log: &L| -> bool {
                if !target.exists() || !target.is_dir() {
                    return false;
                }
                match watcher.watch(target, RecursiveMode::NonRecursive) {
                    Ok(()) => {
                        log("INFO", &format!("MediaWatcher watching {:?}", target));
                        true
                    }
                    Err(e) => {
                        log(
                            "WARN",
                            &format!("MediaWatcher failed to watch {:?}: {}", target, e),
                        );
                        false
                    }
                }
            };

            let mut attached = try_attach(&mut watcher, &desired_target, &on_log);
            if !attached {
                on_log(
                    "WARN",
                    &format!(
                        "MediaWatcher target unavailable at startup (will poll): {:?}",
                        desired_target
                    ),
                );
            }

            let mut pending_deadline: Option<Instant> = None;

            loop {
                let timeout = if let Some(deadline) = pending_deadline {
                    deadline.saturating_duration_since(Instant::now())
                } else {
                    poll_interval
                };

                match rx.recv_timeout(timeout) {
                    Ok(WatcherMsg::SetTarget(new_root)) => {
                        if attached {
                            let _ = watcher.unwatch(&desired_target);
                        }
                        pending_deadline = None;
                        desired_target = new_root;
                        attached = try_attach(&mut watcher, &desired_target, &on_log);
                        if !attached {
                            on_log(
                                "WARN",
                                &format!(
                                    "MediaWatcher new target unavailable (will poll): {:?}",
                                    desired_target
                                ),
                            );
                        }
                    }
                    Ok(WatcherMsg::FsEvent(Ok(event))) => {
                        if !matches!(event.kind, EventKind::Access(_)) {
                            if !desired_target.exists() || !desired_target.is_dir() {
                                if attached {
                                    let _ = watcher.unwatch(&desired_target);
                                    attached = false;
                                    pending_deadline = None;
                                    on_log(
                                        "WARN",
                                        &format!(
                                            "MediaWatcher target disappeared; entering reattach poll: {:?}",
                                            desired_target
                                        ),
                                    );
                                    on_change();
                                }
                            } else {
                                pending_deadline = Some(Instant::now() + debounce);
                            }
                        }
                    }
                    Ok(WatcherMsg::FsEvent(Err(err))) => {
                        on_log(
                            "WARN",
                            &format!("MediaWatcher received fs error: {}", err),
                        );
                        if attached && (!desired_target.exists() || !desired_target.is_dir()) {
                            let _ = watcher.unwatch(&desired_target);
                            attached = false;
                            pending_deadline = None;
                            on_change();
                        }
                    }
                    Ok(WatcherMsg::Stop) => {
                        if attached {
                            let _ = watcher.unwatch(&desired_target);
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

                        if attached && (!desired_target.exists() || !desired_target.is_dir()) {
                            let _ = watcher.unwatch(&desired_target);
                            attached = false;
                            pending_deadline = None;
                            on_log(
                                "WARN",
                                &format!(
                                    "MediaWatcher target lost; emitting media-changed and polling: {:?}",
                                    desired_target
                                ),
                            );
                            on_change();
                        } else if !attached
                            && desired_target.exists()
                            && desired_target.is_dir()
                            && try_attach(&mut watcher, &desired_target, &on_log)
                        {
                            attached = true;
                            on_log(
                                "INFO",
                                &format!(
                                    "MediaWatcher reattached to recreated target: {:?}",
                                    desired_target
                                ),
                            );
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
        Self::start_with_intervals(
            initial_root,
            debounce_ms,
            DEFAULT_REATTACH_POLL_MS,
            on_change,
            on_log,
        )
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

    struct TempDirGuard {
        path: PathBuf,
    }

    impl TempDirGuard {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("kiosk_watch_{}_{}", label, nanos));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn wait_for_count(counter: &AtomicUsize, expected_min: usize, timeout: Duration) -> usize {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            let cur = counter.load(Ordering::SeqCst);
            if cur >= expected_min {
                return cur;
            }
            thread::sleep(Duration::from_millis(50));
        }
        counter.load(Ordering::SeqCst)
    }

    #[test]
    fn test_debounced_watcher_emits_and_retargets() {
        let dir_a = TempDirGuard::new("a");
        let dir_b = TempDirGuard::new("b");

        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = Arc::clone(&count);

        let watcher = MediaWatcher::start_with_intervals(
            &dir_a.path,
            150,
            200,
            move || {
                count_clone.fetch_add(1, Ordering::SeqCst);
            },
            |_lvl, _msg| {},
        )
        .unwrap();

        thread::sleep(Duration::from_millis(120));

        // Burst of 3 writes should debounce into 1 callback
        fs::write(dir_a.path.join("1.mp4"), b"a").unwrap();
        fs::write(dir_a.path.join("1.png"), b"b").unwrap();
        fs::write(dir_a.path.join("2.mp4"), b"c").unwrap();

        let after_burst = wait_for_count(&count, 1, Duration::from_secs(3));
        assert_eq!(after_burst, 1, "Burst should debounce to 1 event");

        // Retarget to dir_b
        watcher.set_target(&dir_b.path).unwrap();
        thread::sleep(Duration::from_millis(120));

        // Write in dir_a should no longer trigger
        fs::write(dir_a.path.join("ignored.mp4"), b"x").unwrap();
        thread::sleep(Duration::from_millis(350));
        assert_eq!(count.load(Ordering::SeqCst), 1);

        // Write in dir_b should trigger
        fs::write(dir_b.path.join("new.mp4"), b"y").unwrap();
        let after_b = wait_for_count(&count, 2, Duration::from_secs(3));
        assert_eq!(after_b, 2);
    }

    #[test]
    fn test_watcher_recovers_when_deleted_folder_is_recreated() {
        let dir = TempDirGuard::new("reattach");
        let count = Arc::new(AtomicUsize::new(0));
        let count_clone = Arc::clone(&count);

        let watcher = MediaWatcher::start_with_intervals(
            &dir.path,
            150,
            200,
            move || {
                count_clone.fetch_add(1, Ordering::SeqCst);
            },
            |_lvl, _msg| {},
        )
        .unwrap();

        thread::sleep(Duration::from_millis(120));

        // 1. Delete watched dir -> expect missing-folder media-changed emit
        fs::remove_dir_all(&dir.path).unwrap();
        let after_delete = wait_for_count(&count, 1, Duration::from_secs(5));
        assert!(after_delete >= 1, "Expected media-changed on folder deletion");

        // 2. Recreate watched dir -> expect reattach media-changed emit
        let before_recreate = count.load(Ordering::SeqCst);
        fs::create_dir_all(&dir.path).unwrap();
        let after_recreate = wait_for_count(&count, before_recreate + 1, Duration::from_secs(5));
        assert!(
            after_recreate > before_recreate,
            "Expected media-changed when folder was recreated"
        );

        // 3. New file in recreated dir should trigger debounced event again
        let before_file = count.load(Ordering::SeqCst);
        fs::write(dir.path.join("recovered.mp4"), b"123").unwrap();
        let after_file = wait_for_count(&count, before_file + 1, Duration::from_secs(5));
        assert!(
            after_file > before_file,
            "Expected debounced event for new file after reattach"
        );

        drop(watcher);
    }
}
