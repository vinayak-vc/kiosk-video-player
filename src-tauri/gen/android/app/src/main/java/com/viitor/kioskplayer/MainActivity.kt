package com.viitor.kioskplayer

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  companion object {
    @Volatile
    private var instance: MainActivity? = null

    @JvmStatic
    fun exitKiosk() {
      instance?.runOnUiThread {
        try {
          instance?.stopLockTask()
        } catch (_: Exception) {}
        instance?.finishAffinity()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    instance = this
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 1. Keep screen awake continuously (no sleep/lock on kiosk display)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // 2. Lock orientation to landscape
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE

    // 3. Apply sticky immersive fullscreen mode (hides status & navigation bars)
    applyStickyImmersiveMode()

    // 4. Block hardware/system Back button and edge back gestures in kiosk mode
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        // No-op in kiosk mode: hardware back cannot exit or break kiosk flow
      }
    })
  }

  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    // Guarantee pitch-black background on hardware video surfaces & letterbox gutters
    webView.setBackgroundColor(android.graphics.Color.BLACK)
    // Enable seamless video autoplay with audio for kiosk touch TV
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      // Re-apply sticky immersive mode when regaining window focus
      applyStickyImmersiveMode()
    }
  }

  override fun onResume() {
    super.onResume()
    applyStickyImmersiveMode()
  }

  override fun onDestroy() {
    if (instance === this) {
      instance = null
    }
    super.onDestroy()
  }

  private fun applyStickyImmersiveMode() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.hide(WindowInsetsCompat.Type.systemBars())
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  }
}
