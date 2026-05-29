export interface Reel {
  id: string;
  url: string;
  uploader: string;
  subtitle: string;
  audioTrackName: string;
  audioTrackUrl: string;
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  motionClass: string;
  lutPreset: string;
  framePresetId: string;
  speed: number;
  bright: number;
  cont: number;
  sat: number;
  hue: number;
  blur: number;
  sepia: number;
  invert: number;
  overlaysMap: Record<string, boolean>;
  timestamp?: number;
}

export interface Playlist {
  name: string;
  term: string;
  img: string;
}

export interface gradingType {
  brightness: number;
  contrast: number;
  saturate: number;
  hueRotate: number;
  blur: number;
  sepia: number;
  invert: number;
}