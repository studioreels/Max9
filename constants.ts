import { Playlist } from "./types";

export const LUT_PRESETS: Record<string, string> = {
  'f-none': '', 
  'f-gold': 'sepia(0.4) contrast(160%) brightness(85%) hue-rotate(-10deg)', 
  'f-kantara': 'saturate(1.8) contrast(125%) brightness(90%)', 
  'f-cyberpunk': 'hue-rotate(140deg) saturate(2.2) contrast(125%)', 
  'f-vintage': 'sepia(0.75) contrast(95%) brightness(95%)',
  'f-noir': 'grayscale(1) contrast(175%) brightness(75%)', 
  'f-blockbuster': 'contrast(125%) saturate(1.45) hue-rotate(-5deg)'
};

export const MOTION_PRESETS = [
  { id: 'fx-none', name: 'RAW MODE ✖️' }, 
  { id: 'fx-zoom-1', name: 'SLOW ZOOM 🔎' }, 
  { id: 'fx-zoom-2', name: 'MID ZOOM 🔍' },
  { id: 'fx-zoom-3', name: 'MEGA ZOOM 🚀' }, 
  { id: 'fx-shake-h', name: 'HARD SHAKE 🌋' }, 
  { id: 'fx-shake-v', name: 'VERT SHAKE 🌪️' },
  { id: 'fx-bounce', name: 'BASS BOUNCE 🔊' }, 
  { id: 'fx-glitch', name: 'DIGI GLITCH 👾' }, 
  { id: 'fx-pulse', name: 'SLOW PULSE 💓' }
];

export const MASTER_FRAMES_DATABASE: Record<string, { name: string; border: string; padding: string }> = {
  'none': { name: 'NO BORDER ✖️', border: 'none', padding: '0px' },
  'f-cinema-1': { name: 'CINEMA 21:9', border: '24px solid #000', padding: '24px' },
  'f-cinema-2': { name: 'VINTAGE WHITE', border: '16px solid #fff', padding: '16px' },
  'f-cinema-3': { name: 'GOLDEN ROYAL', border: '12px double #ffaa00', padding: '12px' }
};

export const KANNADA_PLAYLISTS: Playlist[] = [
  { name: "KGF Chapter 2", term: "KGF 2 Soundtrack", img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=80" },
  { name: "Kantara", term: "Kantara Divine", img: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=120&auto=format&fit=crop&q=80" },
  { name: "Kannada Hits", term: "Kannada Devotional", img: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80" }
];

export const MOCK_REELS_DATABASE = [
  {
     id: "mock_1",
     url: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-light-sign-41846-large.mp4",
     uploader: "hudko_official",
     subtitle: "ಹುಡ್ಕೊ ರೀಲ್ಸ್ ಸ್ಟುಡಿಯೋ ಮಾಸ್ಟರ್ ಎಡಿಟ್ ಶುರುಮಾಡಿ... 🎶⚡",
     audioTrackName: "KGF 2 Monster Theme BGM",
     audioTrackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
     likesCount: 1250, 
     commentsCount: 45, 
     liked: false, 
     motionClass: "fx-none", 
     lutPreset: "f-none", 
     framePresetId: "none", 
     speed: 1.0,
     bright: 100, 
     cont: 100, 
     sat: 100, 
     hue: 0, 
     blur: 0, 
     sepia: 0, 
     invert: 0, 
     overlaysMap: {}
  },
  {
     id: "mock_2",
     url: "https://assets.mixkit.co/videos/preview/mixkit-downtown-tokyo-intersection-at-night-42484-large.mp4",
     uploader: "neon_vibes",
     subtitle: "ಸಿನಿಮ್ಯಾಟಿಕ್ ಕಲರ್ ಗ್ರೇಡಿಂಗ್ ಲೋಡ್ ಆಗಿದೆ 🎨🚀",
     audioTrackName: "Kantara Divine Trance",
     audioTrackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
     likesCount: 4820, 
     commentsCount: 112, 
     liked: false, 
     motionClass: "fx-zoom-1", 
     lutPreset: "f-cyberpunk", 
     framePresetId: "none", 
     speed: 1.0,
     bright: 110, 
     cont: 130, 
     sat: 140, 
     hue: 0, 
     blur: 0, 
     sepia: 0, 
     invert: 0, 
     overlaysMap: { vignette: true }
  }
];