export interface MediaItem {
  id: string;
  filename: string;
  display_title: string;
  video_path: string;
  thumbnail_path: string;
  video_url: string;
  thumbnail_url: string;
  file_size: number;
}

export interface ScanResult {
  items: MediaItem[];
  ignored_orphan_count: number;
  errors: string[];
  root: string;
}

export interface AppConfig {
  kiosk_media_root: string;
  idle_timeout_seconds: number;
  controls_auto_hide_seconds: number;
  slideshow_mode: string;
  cards_per_page: number;
  sfx_enabled: boolean;
  return_to_gallery_on_end: boolean;
}

export type ApplicationState =
  | 'INITIALIZING'
  | 'SCANNING_MEDIA'
  | 'GALLERY'
  | 'INDIVIDUAL_PLAYER'
  | 'SLIDESHOW'
  | 'ADMIN_PANEL'
  | 'ERROR';
