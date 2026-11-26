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

        let app_handle_clone = app_handle.clone();

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

                if let Err(err) = res {
                    if let Some(logger) = app_handle_clone.try_state::<Logger>() {
                        logger.error(&format!("WebView2 kiosk settings failed: {}", err));
                    } else {
                        eprintln!("[ERROR] WebView2 kiosk settings failed: {}", err);
                    }
                }
            })
            .map_err(|e| format!("with_webview failed: {}", e))?;
    }

    Ok(())
}
