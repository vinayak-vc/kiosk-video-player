use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use crate::logger::Logger;

pub fn setup_kiosk_window(app_handle: &AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Failed to find 'main' webview window".to_string())?;

    window
        .set_fullscreen(true)
        .map_err(|e| format!("Failed to set fullscreen: {}", e))?;

    window
        .set_decorations(false)
        .map_err(|e| format!("Failed to disable decorations: {}", e))?;

    window
        .set_resizable(false)
        .map_err(|e| format!("Failed to disable resizable: {}", e))?;

    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;

        let webview_err: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let webview_err_clone = Arc::clone(&webview_err);

        window
            .with_webview(move |webview| {
                let res: Result<(), String> = (|| unsafe {
                    let controller = webview.controller();
                    let core = controller
                        .CoreWebView2()
                        .map_err(|e| format!("CoreWebView2() failed: {}", e))?;
                    let settings = core
                        .Settings()
                        .map_err(|e| format!("Settings() failed: {}", e))?;

                    settings
                        .SetIsZoomControlEnabled(false)
                        .map_err(|e| format!("SetIsZoomControlEnabled(false) failed: {}", e))?;
                    settings
                        .SetAreDefaultContextMenusEnabled(false)
                        .map_err(|e| format!("SetAreDefaultContextMenusEnabled(false) failed: {}", e))?;
                    settings
                        .SetIsStatusBarEnabled(false)
                        .map_err(|e| format!("SetIsStatusBarEnabled(false) failed: {}", e))?;

                    let settings3: ICoreWebView2Settings3 = settings
                        .cast()
                        .map_err(|e| format!("Cast to ICoreWebView2Settings3 failed: {}", e))?;
                    settings3
                        .SetAreBrowserAcceleratorKeysEnabled(false)
                        .map_err(|e| format!("SetAreBrowserAcceleratorKeysEnabled(false) failed: {}", e))?;

                    Ok(())
                })();

                if let Err(err) = res
                    && let Ok(mut guard) = webview_err_clone.lock()
                {
                    *guard = Some(err);
                }
            })
            .map_err(|e| format!("with_webview failed: {}", e))?;

        if let Ok(mut guard) = webview_err.lock()
            && let Some(err) = guard.take()
        {
            if let Some(logger) = app_handle.try_state::<Logger>() {
                logger.error(&format!("WebView2 kiosk settings failed: {}", err));
            }
            return Err(err);
        }
    }

    Ok(())
}
