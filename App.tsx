import React, { useState, useEffect, useRef } from "react";
import { 
  Film, 
  Sparkles, 
  Music, 
  SlidersHorizontal, 
  MoreHorizontal, 
  X, 
  Camera, 
  RotateCw, 
  UploadCloud, 
  Zap, 
  Heart, 
  MessageSquare, 
  Save, 
  Send, 
  Play, 
  Pause,
  Sliders,
  Check,
  FileVideo
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, isFallback } from "./firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy 
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";
import { Reel, Playlist, gradingType } from "./types";
import { 
  LUT_PRESETS, 
  MOTION_PRESETS, 
  MASTER_FRAMES_DATABASE, 
  KANNADA_PLAYLISTS, 
  MOCK_REELS_DATABASE 
} from "./constants";

export default function App() {
  // Auth states
  const [user, setUser] = useState<User | { email: string } | null>(null);
  const [email, setEmail] = useState("studio@hudko.com");
  const [password, setPassword] = useState("password123");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Reels feed states
  const [reels, setReels] = useState<Reel[]>([]);
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Studio / Filter / FX active state (for the current reel)
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelTitle, setPanelTitle] = useState("");

  // Music search in-app
  const [audioSearchQuery, setAudioSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);

  // Camera recording states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [recordingSuccessText, setRecordingSuccessText] = useState("");

  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasAnimIdRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);

  // Load user data on startup
  useEffect(() => {
    if (auth && !isFallback) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser);
          loadReelsFeed();
        } else {
          setUser(null);
        }
      });
      return () => unsubscribe();
    } else {
      // Offline/local sandbox user
      const savedUser = localStorage.getItem("hudko_reels_user");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        loadReelsFeed();
      }
    }
  }, []);

  // Sync Reels from Firestore or localStorage Fallback
  const loadReelsFeed = async () => {
    let loadedReels: Reel[] = [];
    if (db && !isFallback) {
      try {
        const q = query(collection(db, "reels"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedReels.push({
            id: doc.id,
            url: data.url,
            uploader: data.uploader || "creator",
            subtitle: data.subtitle || "...",
            audioTrackName: data.audioTrackName || "Original Sound",
            audioTrackUrl: data.audioTrackUrl || "",
            likesCount: data.likesCount || 0,
            commentsCount: data.commentsCount || 0,
            liked: false,
            motionClass: data.motionClass || "fx-none",
            lutPreset: data.lutPreset || "f-none",
            framePresetId: data.framePresetId || "none",
            speed: data.speed || 1.0,
            bright: data.bright !== undefined ? data.bright : 100,
            cont: data.cont !== undefined ? data.cont : 100,
            sat: data.sat !== undefined ? data.sat : 100,
            hue: data.hue !== undefined ? data.hue : 0,
            blur: data.blur !== undefined ? data.blur : 0,
            sepia: data.sepia !== undefined ? data.sepia : 0,
            invert: data.invert !== undefined ? data.invert : 0,
            overlaysMap: data.overlaysMap || {},
            timestamp: data.timestamp
          });
        });
      } catch (err) {
        console.warn("Could not load from Firestore, using localStorage & default database.", err);
      }
    }

    // Backup Local Storage check
    const savedLocal = localStorage.getItem("hudko_local_reels");
    if (savedLocal) {
      try {
        const parsed = JSON.parse(savedLocal) as Reel[];
        loadedReels = [...parsed, ...loadedReels];
      } catch (e) {
        console.error("Local reels parsing failed", e);
      }
    }

    // Deduplicate or append standard assets
    const fallbackBase = MOCK_REELS_DATABASE.map((item, index) => ({
      ...item,
      id: `local_base_${index}`,
      liked: false,
      overlaysMap: item.overlaysMap || {}
    })) as Reel[];

    const finalReels = loadedReels.length > 0 ? loadedReels : fallbackBase;
    setReels(finalReels);
    
    // Auto sync first item state
    if (finalReels.length > 0) {
      setTimeout(() => {
        syncAudioAndVidState(0, finalReels);
      }, 500);
    }
  };

  // Safe Audio context initializer
  const initAudioCtx = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  };

  // Match and sync video playback rate and soundtrack
  const syncAudioAndVidState = (index: number, list: Reel[] = reels) => {
    const activeReel = list[index];
    if (!activeReel) return;

    // Handle BGM player
    if (bgmAudioRef.current) {
      if (activeReel.audioTrackUrl) {
        bgmAudioRef.current.src = activeReel.audioTrackUrl;
        bgmAudioRef.current.volume = 1.0;
        bgmAudioRef.current.muted = false;
        bgmAudioRef.current.play().catch((err) => {
          console.log("Auto-audio play caught. Standard browsers require interaction first.", err);
        });
      } else {
        bgmAudioRef.current.pause();
      }
    }

    // Handle video mute states - mute video if a soundtrack exists
    list.forEach((_, idx) => {
      const vid = document.getElementById(`video_feed_${idx}`) as HTMLVideoElement | null;
      if (vid) {
        if (idx === index) {
          vid.currentTime = 0;
          vid.playbackRate = activeReel.speed || 1.0;
          vid.muted = activeReel.audioTrackUrl ? true : false;
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      }
    });

    setIsPlaying(true);
  };

  // Top Bar Action: File picker insertion
  const handleFileUploaded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    const newReel: Reel = {
      id: `local_upload_${Date.now()}`,
      url: localUrl,
      uploader: user ? user.email.split("@")[0] : "hudko_user",
      subtitle: "ಗ್ಯಾಲರಿಯಿಂದ ಹೊಸ ವಿಡಿಯೋ ಅಪ್ಲೋಡ್ ಮಾಡಲಾಗಿದೆ! 🎞️✨",
      audioTrackName: "Original Audio Track",
      audioTrackUrl: "",
      likesCount: 0,
      commentsCount: 0,
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
      overlaysMap: {},
      timestamp: Date.now()
    };

    const updated = [newReel, ...reels];
    setReels(updated);
    localStorage.setItem("hudko_local_reels", JSON.stringify(updated.filter(r => r.id.startsWith("local_upload_") || r.id.startsWith("captured_"))));
    setCurrentFeedIndex(0);
    
    // Jump straight to the top
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }

    setTimeout(() => {
      syncAudioAndVidState(0, updated);
    }, 200);
  };

  // Keyboard navigation and snap syncing
  const handleFeedScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollHeight = container.clientHeight;
    if (scrollHeight <= 0) return;

    const index = Math.round(container.scrollTop / scrollHeight);
    if (index !== currentFeedIndex && index >= 0 && index < reels.length) {
      setCurrentFeedIndex(index);
      syncAudioAndVidState(index, reels);
    }
  };

  // Gestures: Tap and Double Tap
  const handleReelClick = (index: number) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // It's a double tap! Like action
      handleSocialAction("like", index);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    } else {
      // Single tap toggle play
      tapTimerRef.current = setTimeout(() => {
        const activeVid = document.getElementById(`video_feed_${index}`) as HTMLVideoElement | null;
        if (activeVid) {
          if (activeVid.paused) {
            activeVid.play().catch(() => {});
            if (reels[index].audioTrackUrl && bgmAudioRef.current) {
              bgmAudioRef.current.play().catch(() => {});
            }
            setIsPlaying(true);
          } else {
            activeVid.pause();
            if (bgmAudioRef.current) bgmAudioRef.current.pause();
            setIsPlaying(false);
          }
        }
      }, DOUBLE_TAP_DELAY);
    }
    lastTapRef.current = now;
  };

  // Like or Comment triggers
  const handleSocialAction = (action: "like" | "comment", index: number) => {
    const updated = [...reels];
    const item = updated[index];
    if (!item) return;

    if (action === "like") {
      item.liked = !item.liked;
      item.likesCount = item.liked ? item.likesCount + 1 : item.likesCount - 1;
    } else if (action === "comment") {
      const txt = prompt("ನಿಮ್ಮ ಕಾಮೆಂಟ್ ಬರೆಯಿರಿ (Type Comment):");
      if (txt && txt.trim()) {
        item.commentsCount += 1;
      }
    }
    setReels(updated);
  };

  // In-App Studio Panel Controls
  const triggerPanelOpen = (tabType: string, titleLabel: string) => {
    setPanelTitle(titleLabel);
    setActiveTab(tabType);
  };

  const updateActiveReelGrading = (key: keyof gradingType, val: number) => {
    const updated = [...reels];
    const item = updated[currentFeedIndex];
    if (!item) return;

    if (key === "brightness") item.bright = val;
    if (key === "contrast") item.cont = val;
    if (key === "saturate") item.sat = val;
    if (key === "hueRotate") item.hue = val;
    if (key === "blur") item.blur = val;
    if (key === "sepia") item.sepia = val;
    if (key === "invert") item.invert = val;

    setReels(updated);
  };

  const updateActiveReelConfig = (field: "lutPreset" | "motionClass" | "framePresetId" | "speed" | "subtitle", val: any) => {
    const updated = [...reels];
    const item = updated[currentFeedIndex];
    if (!item) return;

    item[field] = val;
    setReels(updated);

    if (field === "speed") {
      const vid = document.getElementById(`video_feed_${currentFeedIndex}`) as HTMLVideoElement | null;
      if (vid) vid.playbackRate = val;
    }
  };

  const toggleOverlaySetting = (overlayKey: string) => {
    const updated = [...reels];
    const item = updated[currentFeedIndex];
    if (!item) return;

    const overlayMap = { ...item.overlaysMap };
    overlayMap[overlayKey] = !overlayMap[overlayKey];
    item.overlaysMap = overlayMap;
    setReels(updated);
  };

  // Search tracks using iTunes Endpoint
  const handleMusicSearch = async (term: string) => {
    if (!term.trim()) return;
    setAudioSearchQuery(term);
    setIsSearchingMusic(true);
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=12`);
      const payload = await r.json();
      if (payload.results) {
        setSearchResults(payload.results);
      }
    } catch (e) {
      console.error("Music fetch error", e);
    } finally {
      setIsSearchingMusic(false);
    }
  };

  const assignSoundtrackToReel = (previewUrl: string, titleStr: string) => {
    initAudioCtx();
    const updated = [...reels];
    const item = updated[currentFeedIndex];
    if (!item) return;

    item.audioTrackUrl = previewUrl;
    item.audioTrackName = titleStr;
    setReels(updated);

    // Sync audio track immediately
    if (bgmAudioRef.current) {
      bgmAudioRef.current.src = previewUrl;
      bgmAudioRef.current.volume = 1.0;
      bgmAudioRef.current.muted = false;
      bgmAudioRef.current.play().catch(() => {});
    }

    const vid = document.getElementById(`video_feed_${currentFeedIndex}`) as HTMLVideoElement | null;
    if (vid) vid.muted = true;
  };

  // Hard Render In-App merging and preview engine
  const performAdvancedInAppFXMerge = async (index: number): Promise<string> => {
    const targetInstance = reels[index];
    const nativeVideoNode = document.getElementById(`video_feed_${index}`) as HTMLVideoElement | null;
    if (!targetInstance || !nativeVideoNode) return "";

    return new Promise((resolve) => {
      try {
        const renderCanvas = document.createElement("canvas");
        const renderCtx = renderCanvas.getContext("2d");
        if (!renderCtx) {
          resolve(targetInstance.url);
          return;
        }

        renderCanvas.width = nativeVideoNode.videoWidth || 720;
        renderCanvas.height = nativeVideoNode.videoHeight || 1280;

        // Extract applied grading filters
        const activeLut = LUT_PRESETS[targetInstance.lutPreset] || "";
        const gradingFilter = `brightness(${targetInstance.bright || 100}%) contrast(${targetInstance.cont || 100}%) saturate(${targetInstance.sat || 100}%) hue-rotate(${targetInstance.hue || 0}deg) sepia(${targetInstance.sepia || 0}%) blur(${targetInstance.blur || 0}px)`.trim();
        renderCtx.filter = `${activeLut} ${gradingFilter}`.trim();

        const canvasStream = renderCanvas.captureStream(30);
        const compositeStream = new MediaStream();
        canvasStream.getVideoTracks().forEach(t => compositeStream.addTrack(t));

        // Setup audio rendering destination
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();

        if (targetInstance.audioTrackUrl) {
          const sound = new Audio();
          sound.crossOrigin = "anonymous";
          sound.src = targetInstance.audioTrackUrl;
          sound.currentTime = nativeVideoNode.currentTime;
          
          const srcNode = audioCtx.createMediaElementSource(sound);
          srcNode.connect(dest);
          sound.play().catch(() => {});
        } else {
          // Fallback to video microphone or clean state
          const vidStream = (nativeVideoNode as any).captureStream?.();
          if (vidStream && vidStream.getAudioTracks().length > 0) {
            const srcNode = audioCtx.createMediaStreamSource(vidStream);
            srcNode.connect(dest);
          }
        }

        dest.stream.getAudioTracks().forEach(t => compositeStream.addTrack(t));

        let mediaOptions = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (!MediaRecorder.isTypeSupported(mediaOptions.mimeType)) {
          mediaOptions = { mimeType: 'video/webm' };
        }

        const internalRecorder = new MediaRecorder(compositeStream, mediaOptions);
        let chunks: Blob[] = [];

        internalRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };

        internalRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mediaOptions.mimeType });
          resolve(URL.createObjectURL(blob));
        };

        internalRecorder.start();

        let renderActive = true;
        const drawLoop = () => {
          if (!renderActive) return;
          renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
          renderCtx.drawImage(nativeVideoNode, 0, 0, renderCanvas.width, renderCanvas.height);
          requestAnimationFrame(drawLoop);
        };
        drawLoop();

        setTimeout(() => {
          renderActive = false;
          try {
            internalRecorder.stop();
          } catch (e) {
            resolve(targetInstance.url);
          }
        }, 3000); // Record a high-quality 3-second render chunk
      } catch (e) {
        console.error("Renderer Merge failed, fallback directly to reel source url", e);
        resolve(targetInstance.url);
      }
    });
  };

  // In-App Database Save Trigger (Mainly to Firestore and local fallback profiles)
  const saveToUserProfileOnly = async (index: number) => {
    const tgt = reels[index];
    if (!tgt) return;

    setRecordingSuccessText("ಸೇವ್ ಆಗುತ್ತಿದೆ... (Saving dynamic composition...)");
    const mergedUrl = await performAdvancedInAppFXMerge(index);

    const savingPayload = {
      url: mergedUrl || tgt.url,
      uploader: user ? user.email.split("@")[0] : "creator",
      subtitle: tgt.subtitle || "Hudko Masterpiece",
      audioTrackUrl: tgt.audioTrackUrl || "",
      audioTrackName: tgt.audioTrackName || "Original Sound",
      lutPreset: tgt.lutPreset,
      motionClass: tgt.motionClass,
      framePresetId: tgt.framePresetId,
      speed: tgt.speed,
      bright: tgt.bright,
      cont: tgt.cont,
      sat: tgt.sat,
      hue: tgt.hue,
      blur: tgt.blur,
      sepia: tgt.sepia,
      invert: tgt.invert,
      overlaysMap: tgt.overlaysMap,
      likesCount: tgt.likesCount,
      commentsCount: tgt.commentsCount,
      timestamp: Date.now()
    };

    if (db && !isFallback && user) {
      try {
        await addDoc(collection(db, "reels"), savingPayload);
        alert("💾 ಯಶಸ್ವಿಯಾಗಿ ಆನ್‌ಲೈನ್ ಪ್ರೊಫೈಲ್ ಡೇಟಾಬೇಸ್‌ಗೆ ಸೇವ್ ಮಾಡಲಾಗಿದೆ!");
      } catch (err: any) {
        console.warn("Firestore save failed, committing locally to storage sandbox...", err);
        saveLocallyOnly(savingPayload);
      }
    } else {
      saveLocallyOnly(savingPayload);
    }
    setRecordingSuccessText("");
  };

  const saveLocallyOnly = (payload: any) => {
    const localStoreKey = "hudko_local_reels";
    const existingStr = localStorage.getItem(localStoreKey);
    let existingList: any[] = [];
    if (existingStr) {
      try { existingList = JSON.parse(existingStr); } catch (e) {}
    }
    existingList.unshift(payload);
    localStorage.setItem(localStoreKey, JSON.stringify(existingList));
    alert("💾 ಯಶಸ್ವಿಯಾಗಿ ಲೋಕಲ್ ಪ್ರೊಫೈಲ್‌ಗೆ ಸೇವ್ ಮಾಡಲಾಗಿದೆ (Saved locally to offline sandbox)!");
    loadReelsFeed();
  };

  // Share action triggered on share button
  const shareReelUrl = async (index: number) => {
    const item = reels[index];
    if (!item) return;

    const shareTitle = "Hudko Reels Studio";
    const shareText = `ನಿಮ್ಮ ಸಿನಿಮ್ಯಾಟಿಕ್ ರೀಲ್ ನೋಡಿ! ${item.subtitle} (Music: ${item.audioTrackName})`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: item.url
        });
      } catch (e) {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + item.url)}`, "_blank");
      }
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + item.url)}`, "_blank");
    }
  };

  // Live Camera Controls
  const openCameraRecord = async () => {
    setIsCameraOpen(true);
    setRecordingSuccessText("");
    try {
      const liveStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = liveStream;
        cameraVideoRef.current.onloadedmetadata = () => {
          cameraVideoRef.current?.play().catch(() => {});
          if (cameraCanvasRef.current && cameraVideoRef.current) {
            cameraCanvasRef.current.width = cameraVideoRef.current.videoWidth || 1280;
            cameraCanvasRef.current.height = cameraVideoRef.current.videoHeight || 720;
            triggerCanvasRenderLoop();
          }
        };
      }
    } catch (e: any) {
      alert("ಲೈವ್ ಕ್ಯಾಮರಾ ಪ್ರವೇಶಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ, ದಯವಿಟ್ಟು ಪರ್ಮಿಷನ್ ನೀಡಿ: " + e.message);
      setIsCameraOpen(false);
    }
  };

  const closeLiveCamera = () => {
    if (canvasAnimIdRef.current) {
      cancelAnimationFrame(canvasAnimIdRef.current);
    }
    const stream = cameraVideoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsRecording(false);
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    
    // Stop tracks
    const stream = cameraVideoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    
    setTimeout(() => {
      openCameraRecord();
    }, 200);
  };

  const triggerCanvasRenderLoop = () => {
    const vid = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!vid || !canvas || !ctx) return;

    const render = () => {
      if (vid.paused || vid.ended) return;

      // Map interactive filters
      const activeReel = reels[currentFeedIndex] || {
        lutPreset: "f-none",
        bright: 100, cont: 100, sat: 100, hue: 0, blur: 0, sepia: 0, invert: 0
      };

      const baseLutString = LUT_PRESETS[activeReel.lutPreset || "f-none"] || "";
      const gradingString = `brightness(${activeReel.bright || 100}%) contrast(${activeReel.cont || 100}%) saturate(${activeReel.sat || 100}%) hue-rotate(${activeReel.hue || 0}deg) sepia(${activeReel.sepia || 0}%) blur(${activeReel.blur || 0}px)`.trim();
      
      ctx.filter = `${baseLutString} ${gradingString}`.trim();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (facingMode === "user") {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      }

      canvasAnimIdRef.current = requestAnimationFrame(render);
    };

    render();
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording from canvas
      recordedChunksRef.current = [];
      const canvasStream = cameraCanvasRef.current?.captureStream(30);
      if (!canvasStream) return;

      const mediaStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(t => mediaStream.addTrack(t));

      // Append microphone stream if available
      const origStream = cameraVideoRef.current?.srcObject as MediaStream | null;
      if (origStream && origStream.getAudioTracks().length > 0) {
        mediaStream.addTrack(origStream.getAudioTracks()[0]);
      }

      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const recordedUrl = URL.createObjectURL(recordedBlob);
        
        const newlyRecordedReel: Reel = {
          id: `captured_${Date.now()}`,
          url: recordedUrl,
          uploader: user ? user.email.split("@")[0] : "creator_camera",
          subtitle: "ಲೈವ್ ಕ್ಯಾಮೆರಾ ರೆಕಾರ್ಡಿಂಗ್ ಯಶಸ್ವಿಯಾಗಿದೆ! 📸✨",
          audioTrackName: reels[currentFeedIndex]?.audioTrackName || "Original Mic Track",
          audioTrackUrl: reels[currentFeedIndex]?.audioTrackUrl || "",
          likesCount: 0,
          commentsCount: 0,
          liked: false,
          motionClass: reels[currentFeedIndex]?.motionClass || "fx-none",
          lutPreset: reels[currentFeedIndex]?.lutPreset || "f-none",
          framePresetId: reels[currentFeedIndex]?.framePresetId || "none",
          speed: reels[currentFeedIndex]?.speed || 1.0,
          bright: reels[currentFeedIndex]?.bright || 100,
          cont: reels[currentFeedIndex]?.cont || 100,
          sat: reels[currentFeedIndex]?.sat || 100,
          hue: reels[currentFeedIndex]?.hue || 0,
          blur: reels[currentFeedIndex]?.blur || 0,
          sepia: reels[currentFeedIndex]?.sepia || 0,
          invert: reels[currentFeedIndex]?.invert || 0,
          overlaysMap: { ...reels[currentFeedIndex]?.overlaysMap },
          timestamp: Date.now()
        };

        const updated = [newlyRecordedReel, ...reels];
        setReels(updated);
        localStorage.setItem("hudko_local_reels", JSON.stringify(updated.filter(r => r.id.startsWith("captured_") || r.id.startsWith("local_upload_"))));
        setCurrentFeedIndex(0);
        
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
        }

        closeLiveCamera();
        setTimeout(() => {
          syncAudioAndVidState(0, updated);
        }, 300);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    }
  };

  // Auth Submit Handlers
  const handleAuthSubmit = async (mode: "login" | "signup") => {
    if (!email || !password) {
      setAuthError("ದಯವಿಟ್ಟು ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ!");
      return;
    }
    setAuthError("");
    setIsAuthLoading(true);

    if (auth && !isFallback) {
      try {
        if (mode === "login") {
          const credentials = await signInWithEmailAndPassword(auth, email, password);
          setUser(credentials.user);
        } else {
          const credentials = await createUserWithEmailAndPassword(auth, email, password);
          setUser(credentials.user);
          alert("ಅಕೌಂಟ್ ರೆಡಿಯಾಗಿದೆ! Welcome to Hudko Studio.");
        }
      } catch (err: any) {
        setAuthError(err.message || "Authentication error occurred.");
      } finally {
        setIsAuthLoading(false);
      }
    } else {
      // Local storage mock login bypass
      const mockUser = { email };
      localStorage.setItem("hudko_reels_user", JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAuthLoading(false);
    }
  };

  const handleBypassAuth = () => {
    const mockUser = { email: "guest_hudko@hudko.com" };
    localStorage.setItem("hudko_reels_user", JSON.stringify(mockUser));
    setUser(mockUser);
  };

  const handleSignOut = async () => {
    if (auth && !isFallback) {
      await signOut(auth);
    }
    localStorage.removeItem("hudko_reels_user");
    setUser(null);
  };

  // Setup initial default playlist queries
  useEffect(() => {
    handleMusicSearch("Kannada Hit");
  }, []);

  // Compute CSS grade filter for active UI index
  const getActiveReelFilterStyle = (idx: number) => {
    const item = reels[idx];
    if (!item) return "";
    const baseLutString = LUT_PRESETS[item.lutPreset] || "";
    const gradingString = `brightness(${item.bright ?? 100}%) contrast(${item.cont ?? 100}%) saturate(${item.sat ?? 100}%) hue-rotate(${item.hue ?? 0}deg) sepia(${item.sepia ?? 0}%) blur(${item.blur ?? 0}px) invert(${item.invert ?? 0}%)`.trim();
    return `${baseLutString} ${gradingString}`.trim();
  };

  return (
    <div className="relative text-white flex flex-col h-dvh w-screen overflow-hidden bg-black font-sans select-none">
      
      {/* BACKGROUND MULTI SOUNDTRACK PLAYER */}
      <audio ref={bgmAudioRef} loop playsInline crossOrigin="anonymous" className="hidden" />

      {/* AUTH SCREEN IN KANNADA */}
      <AnimatePresence>
        {!user && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-radial from-[#1e1e2d] to-black flex flex-col items-center justify-center z-[1000] p-4"
          >
            <div className="auth-box text-center p-8 max-w-sm w-full bg-white/5 border border-white/10 rounded-[24px] backdrop-blur-xl shadow-2xl">
              <h1 className="text-4xl font-extrabold pb-1 tracking-tight bg-gradient-to-r from-amber-400 via-rose-500 to-cyan-400 bg-clip-text text-fill-transparent font-heading">
                HUDKO REELS
              </h1>
              <p className="text-xs tracking-wider uppercase text-amber-400 font-mono mb-6">
                v2000 Ultimate Magic Engine
              </p>

              {authError && (
                <div className="mb-4 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg font-mono">
                  {authError}
                </div>
              )}

              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-3 text-sm text-white focus:outline-none focus:border-amber-400" 
                placeholder="ಇಮೇಲ್" 
              />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-4 text-sm text-white focus:outline-none focus:border-amber-400" 
                placeholder="ಪಾಸ್‌ವರ್ಡ್‌" 
              />

              <button 
                onClick={() => handleAuthSubmit("login")}
                disabled={isAuthLoading}
                className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:opacity-95 text-black font-bold rounded-xl text-sm transition-transform active:scale-98 cursor-pointer shadow-lg shadow-amber-500/15"
              >
                {isAuthLoading ? "ಲೋಡ್ ಆಗುತ್ತಿದೆ..." : "LOG IN"}
              </button>

              <button 
                onClick={() => handleAuthSubmit("signup")}
                disabled={isAuthLoading}
                className="w-full mt-2.5 py-3 bg-transparent hover:bg-white/5 text-amber-400 font-semibold rounded-xl text-sm border border-amber-400/20 transition-all cursor-pointer"
              >
                CREATE ACCOUNT
              </button>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[#12121c] text-neutral-400">ಅಥವಾ</span>
                </div>
              </div>

              <button 
                onClick={handleBypassAuth}
                className="w-full py-2.5 bg-neutral-800/80 text-neutral-300 font-bold hover:bg-neutral-800 text-xs rounded-xl cursor-pointer tracking-wider"
              >
                GUEST ACCESS ⚡
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CAMERA RECORDER FULL CONTAINER */}
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-0 bg-black z-[850] flex flex-col justify-between p-4 safe-top safe-bottom"
          >
            <div className="relative w-full flex-1 rounded-[24px] overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl flex items-center justify-center">
              {/* Invisible hidden raw preview */}
              <video 
                ref={cameraVideoRef} 
                autoplay 
                playsinline 
                muted 
                className="hidden" 
              />
              
              {/* Display Canvas with applied grading filters */}
              <canvas 
                ref={cameraCanvasRef} 
                className="w-full h-full object-cover rounded-[24px]" 
              />

              {isRecording && (
                <div className="absolute top-4 left-4 bg-rose-500/15 border border-rose-500/30 px-3.5 py-1.5 rounded-full flex items-center gap-2 font-mono text-xs text-rose-400 animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  RECORDING LIVE
                </div>
              )}

              {recordingSuccessText && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 p-6 text-center z-50">
                  <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-amber-400 font-mono font-semibold">{recordingSuccessText}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-around h-[12vh] mt-4">
              <button 
                onClick={closeLiveCamera}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white border border-white/10 cursor-pointer backdrop-blur-md"
              >
                <X className="w-6 h-6" />
              </button>

              <button 
                onClick={handleToggleRecord}
                className={`w-20 h-20 rounded-full flex items-center justify-center border-4 border-white shadow-2xl transition-all cursor-pointer ${
                  isRecording 
                    ? "bg-white scale-110 !border-rose-500 rounded-2xl animate-pulse" 
                    : "bg-rose-500"
                }`}
              />

              <button 
                onClick={toggleFacingMode}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white border border-white/10 cursor-pointer backdrop-blur-md"
              >
                <RotateCw className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP DOCK OVERLAY BRAND */}
      <div id="top-nav-dock" className="absolute top-0 inset-x-0 h-[80px] bg-gradient-to-b from-black/92 via-black/40 to-transparent flex items-end justify-between px-4 pb-3 z-[100] pointer-events-none">
        <div className="flex flex-col pointer-events-auto">
          <h2 className="text-lg font-black tracking-tight bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-fill-transparent font-heading">
            🎬 HUDKO STUDIO
          </h2>
          <span className="text-[10px] text-neutral-400 font-mono -mt-1 font-semibold">
            {user?.email}
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={openCameraRecord}
            className="px-3.5 py-1.5 bg-white/12 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-md backdrop-blur-md"
          >
            <Camera className="w-3.5 h-3.5" /> 📸 Cam
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-white/12 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-md backdrop-blur-md"
          >
            <UploadCloud className="w-3.5 h-3.5" /> + Gallery
          </button>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUploaded} 
            accept="video/*" 
            className="hidden" 
          />

          <button 
            onClick={() => saveToUserProfileOnly(currentFeedIndex)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-extrabold text-xs rounded-full flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-lg"
          >
            <Zap className="w-3.5 h-3.5 text-black" /> ⚡ Post Reel
          </button>

          <button 
            onClick={handleSignOut}
            className="p-1 px-2.5 text-[9px] bg-neutral-800 text-neutral-400 rounded-md cursor-pointer hover:bg-neutral-700 font-mono"
          >
            SignOut
          </button>
        </div>
      </div>

      {/* MASTER SNAP REELS PLAYBACK CONTAINER */}
      <div 
        ref={containerRef}
        onScroll={handleFeedScroll}
        className="w-full h-full overflow-y-scroll snap-y-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {reels.map((reel, index) => {
          const isCurrent = index === currentFeedIndex;
          const filterString = getActiveReelFilterStyle(index);

          return (
            <div 
              key={reel.id}
              className="w-full h-full relative flex items-center justify-center overflow-hidden snap-start select-none bg-neutral-950"
            >
              <div 
                className="relative w-full h-full flex items-center justify-center transition-all duration-300"
                style={{
                  border: reel.framePresetId ? (MASTER_FRAMES_DATABASE[reel.framePresetId]?.border || "none") : "none",
                  padding: reel.framePresetId ? (MASTER_FRAMES_DATABASE[reel.framePresetId]?.padding || "0px") : "0px",
                }}
              >
                {/* VIDEO ELEMENT */}
                <video 
                  id={`video_feed_${index}`}
                  src={reel.url}
                  loop 
                  muted 
                  playsinline 
                  className={`w-full h-full object-cover ${reel.motionClass || ""}`}
                  style={{ filter: filterString }}
                  onClick={() => handleReelClick(index)}
                />

                {/* FILTERS & DYNAMICS LAYERS */}
                {reel.overlaysMap?.vignette && <div className="vignette-overlay" />}
                {reel.overlaysMap?.grain && <div className="grain-overlay" />}
                {reel.overlaysMap?.letterbox && <div className="letterbox-overlay" />}
                
                {reel.overlaysMap?.neon && (
                  <div className="absolute inset-0 border-[10px] border-cyan-400 animate-pulse pointer-events-none z-20 shadow-[inset_0_0_30px_rgba(0,255,242,0.6)]" />
                )}
                {reel.overlaysMap?.leak && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 via-rose-500/20 to-transparent mix-blend-color-dodge pointer-events-none z-15" />
                )}
                {reel.overlaysMap?.grid && (
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-15" />
                )}
                {reel.overlaysMap?.cyber && (
                  <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_2px,transparent_2px)] bg-[size:100%_4px] pointer-events-none z-15" />
                )}

                {/* PLAYBACK STATE PAUSED INDICATOR */}
                {!isPlaying && isCurrent && (
                  <div className="absolute pointer-events-none text-white/50 bg-black/40 p-5 rounded-full z-30 flex items-center justify-center shadow-lg transform scale-110">
                    <Pause className="w-10 h-10 text-white fill-white" />
                  </div>
                )}

                {/* PROGRESS CONTAINER */}
                <div className="absolute bottom-[60px] inset-x-0 h-[3px] bg-white/15 z-50">
                  <div 
                    id={`progress_bar_${index}`}
                    className="h-full bg-amber-400 shadow-[0_0_8px_#ffaa00]"
                    style={{ width: "0%" }}
                  />
                </div>

                {/* LEFT BOTTOM OVERLAY: Creator Handle and Metadata */}
                <div className="absolute bottom-[75px] left-4 right-[84px] pointer-events-none z-40 flex flex-col gap-2">
                  <span className="text-sm font-bold text-cyan-400 drop-shadow-md flex items-center gap-1.5 select-none text-shadow-black">
                    @{reel.uploader || "creator"} <span className="text-[10px] font-semibold text-white/80">• Follow</span>
                  </span>

                  <span className="text-white text-xs font-medium max-w-lg bg-black/40 drop-shadow p-2.5 rounded-xl border-l-4 border-amber-400 line-clamp-3 select-none text-shadow-black">
                    {reel.subtitle || "..."}
                  </span>

                  <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1 drop-shadow select-none text-shadow-black">
                    <Music className="w-3.5 h-3.5 text-amber-400 rotate-12" /> {reel.audioTrackName || "Original Sound"}
                  </span>
                </div>

                {/* RIGHT SIDEBAR ENGAGEMENT FLOATING */}
                <div className="absolute bottom-[85px] right-4 flex flex-col gap-4 items-center z-40 select-none">
                  
                  {/* Dynamic in-app save profile persistence */}
                  <div 
                    onClick={() => saveToUserProfileOnly(index)}
                    className="flex flex-col items-center cursor-pointer group"
                    id={`save-profile-btn-${index}`}
                  >
                    <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform active:scale-95 shadow-xl">
                      <Save className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className="text-[10px] font-bold text-neutral-300 mt-1 select-none">Save</span>
                  </div>

                  {/* Like button */}
                  <div 
                    onClick={() => handleSocialAction("like", index)}
                    className="flex flex-col items-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform active:scale-95 shadow-xl">
                      <Heart className={`w-5 h-5 transition-colors ${reel.liked ? "text-rose-500 fill-rose-500" : "text-white"}`} />
                    </div>
                    <span className="text-[10px] font-bold text-neutral-300 mt-1 select-none">{reel.likesCount}</span>
                  </div>

                  {/* Comment trigger */}
                  <div 
                    onClick={() => handleSocialAction("comment", index)}
                    className="flex flex-col items-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform active:scale-95 shadow-xl">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-neutral-300 mt-1 select-none">{reel.commentsCount}</span>
                  </div>

                  {/* Share button */}
                  <div 
                    onClick={() => shareReelUrl(index)}
                    className="flex flex-col items-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform active:scale-95 shadow-xl">
                      <Send className="w-5 h-5 text-amber-400" />
                    </div>
                    <span className="text-[10px] font-bold text-neutral-300 mt-1 select-none">Share</span>
                  </div>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTINUOUS SYNC FOR REELS PROGRESS BAR */}
      <IntervalSyncComponent currentFeedIndex={currentFeedIndex} reels={reels} />

      {/* REELS INTERACTIVE OVERLAY CONFIGURATION STUDIO SLIDE-UP PANEL */}
      <AnimatePresence>
        {activeTab && (
          <>
            {/* Ambient Backdrop click to close */}
            <div 
              className="fixed inset-0 bg-black/50 z-[890]" 
              onClick={() => setActiveTab(null)}
            />

            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="fixed bottom-0 inset-x-0 h-[50vh] bg-neutral-950/95 border-t border-white/10 z-[900] p-4 flex flex-col rounded-t-[24px] backdrop-blur-2xl safe-bottom"
            >
              <div className="flex items-center justify-between pb-3.5 border-b border-white/5">
                <span className="text-xs font-extrabold tracking-wider text-amber-400 font-mono uppercase">
                  {panelTitle}
                </span>
                <button 
                  onClick={() => setActiveTab(null)}
                  className="p-1 rounded-full text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* DYNAMIC SCROLLABLE GRID TOOL CONTENT PANEL */}
              <div className="flex-1 overflow-y-auto pt-3 pb-6">
                
                {/* 1. FILTER LUT PRESETS */}
                {activeTab === "lut" && (
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(LUT_PRESETS).map((key) => {
                      const isSelected = reels[currentFeedIndex]?.lutPreset === key;
                      return (
                        <button 
                          key={key}
                          onClick={() => updateActiveReelConfig("lutPreset", key)}
                          className={`py-3.5 px-3 rounded-xl font-bold text-xs flex flex-col items-center justify-center text-center cursor-pointer transition-all border ${
                            isSelected 
                              ? "bg-gradient-to-r from-amber-400 to-orange-500 border-none text-black" 
                              : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="text-[10px] font-mono tracking-wide uppercase font-black">
                            {key.replace("f-", "")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. SPECIAL KINETIC FX MAGIC */}
                {activeTab === "motion" && (
                  <div className="grid grid-cols-3 gap-2">
                    {MOTION_PRESETS.map((item) => {
                      const isSelected = reels[currentFeedIndex]?.motionClass === item.id;
                      return (
                        <button 
                          key={item.id}
                          onClick={() => updateActiveReelConfig("motionClass", item.id)}
                          className={`py-4 px-3 rounded-xl font-extrabold text-xs text-center cursor-pointer transition-all border ${
                            isSelected 
                              ? "bg-gradient-to-r from-amber-400 to-orange-500 border-none text-black animate-pulse" 
                              : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"
                          }`}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3. COLOR GRADIENTS DESIGNER MULTI SLIDERS */}
                {activeTab === "color" && (
                  <div className="space-y-4">
                    {[
                      { id: "brightness", label: "BRIGHTNESS [ಕಾಂತಿ]", min: 30, max: 200, unit: "%", stateKey: "bright" },
                      { id: "contrast", label: "CONTRAST [ವ್ಯತ್ಯಾಸ]", min: 30, max: 200, unit: "%", stateKey: "cont" },
                      { id: "saturate", label: "SATURATION [ಶಕ್ತಿ]", min: 0, max: 250, unit: "%", stateKey: "sat" },
                      { id: "hueRotate", label: "COLOR HUE [ವರ್ಣ]", min: 0, max: 360, unit: "deg", stateKey: "hue" },
                      { id: "sepia", label: "SEPIA [ಸೆಪಿಯಾ]", min: 0, max: 100, unit: "%", stateKey: "sepia" },
                      { id: "blur", label: "BLUR [ಮಸುಕು]", min: 0, max: 8, unit: "px", stateKey: "blur" },
                      { id: "invert", label: "INVERT [ವಿಲೋಮ]", min: 0, max: 100, unit: "%", stateKey: "invert" }
                    ].map((item) => {
                      const reelVal = reels[currentFeedIndex]?.[item.stateKey as keyof Reel] as number ?? 100;
                      return (
                        <div key={item.id} className="p-3 rounded-xl border border-white/5 bg-white/2">
                          <div className="flex justify-between items-center text-xs font-bold text-neutral-400 mb-2">
                            <span>{item.label}</span>
                            <span className="text-amber-400 font-mono tracking-wide">{reelVal}{item.unit}</span>
                          </div>
                          <input 
                            type="range"
                            min={item.min}
                            max={item.max}
                            value={reelVal}
                            onChange={(e) => updateActiveReelGrading(item.id as keyof gradingType, parseFloat(e.target.value))}
                            className="w-full h-1.5 focus:outline-none accent-amber-400 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. OVERLAYS CINEMA LAYERS CONFIG */}
                {activeTab === "overlay" && (
                  <div className="space-y-4">
                    {/* Header bar controls navigation */}
                    <div className="flex gap-2">
                      <button className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-400 text-black border-none">Layers</button>
                      <button onClick={() => triggerPanelOpen("frame", "🖼️ Borders Frame")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Borders</button>
                      <button onClick={() => triggerPanelOpen("speed", "⚡ Speed Multiplier")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Speed</button>
                      <button onClick={() => triggerPanelOpen("subtitle", "✍️ Edit Dialogue")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Subtitles</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "vignette", label: "VIGNETTE 🌑 [ಕತ್ತಲೆ]" }, 
                        { id: "grain", label: "CINEMA GRAIN 🌫️ [ಧೂಳು]" }, 
                        { id: "letterbox", label: "CINEMA BARS 🎞️ [ತೆರೆ]" },
                        { id: "neon", label: "NEON BORDER 💎 [ಪ್ರಕಾಶ]" }, 
                        { id: "leak", label: "LIGHT LEAK 🌅 [ಕಿರಣ]" }, 
                        { id: "grid", label: "CAMERA GRID 🌐 [ಜಾಲರ]" }, 
                        { id: "cyber", label: "CRT LINES 📺 [ಸ್ಕ್ರೀನ್]" }
                      ].map((item) => {
                        const isSet = reels[currentFeedIndex]?.overlaysMap?.[item.id] || false;
                        return (
                          <button 
                            key={item.id}
                            onClick={() => toggleOverlaySetting(item.id)}
                            className={`py-3.5 px-3 rounded-xl text-center font-bold text-xs select-none cursor-pointer transition-all border ${
                              isSet 
                                ? "bg-amber-400 border-none text-black" 
                                : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"
                            }`}
                          >
                             {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. CINEMA FRAMES */}
                {activeTab === "frame" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button onClick={() => triggerPanelOpen("overlay", "🎭 Overlays Engine")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Layers</button>
                      <button className="flex-1 py-2 rounded-lg text-black bg-amber-400 text-xs font-bold">Borders</button>
                      <button onClick={() => triggerPanelOpen("speed", "⚡ Speed Multiplier")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Speed</button>
                      <button onClick={() => triggerPanelOpen("subtitle", "✍️ Edit Dialogue")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Subtitles</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(MASTER_FRAMES_DATABASE).map((key) => {
                        const isSelected = reels[currentFeedIndex]?.framePresetId === key;
                        return (
                          <button 
                            key={key}
                            onClick={() => updateActiveReelConfig("framePresetId", key)}
                            className={`py-4 px-3 rounded-xl text-center font-bold text-xs cursor-pointer transition-all border ${
                              isSelected 
                                ? "bg-amber-400 border-none text-black" 
                                : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"
                            }`}
                          >
                            {MASTER_FRAMES_DATABASE[key].name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6. PLAYBACK SPEED MULTIPLIER */}
                {activeTab === "speed" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button onClick={() => triggerPanelOpen("overlay", "🎭 Overlays Engine")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Layers</button>
                      <button onClick={() => triggerPanelOpen("frame", "🖼️ Borders Frame")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Borders</button>
                      <button className="flex-1 py-2 rounded-lg text-black bg-amber-400 text-xs font-bold">Speed</button>
                      <button onClick={() => triggerPanelOpen("subtitle", "✍️ Edit Dialogue")} className="flex-1 py-2 rounded-lg text-neutral-400 bg-white/5 text-xs font-bold hover:bg-white/10">Subtitles</button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[0.25, 0.5, 1.0, 1.5, 2.0, 3.0].map((s) => {
                        const isSelected = reels[currentFeedIndex]?.speed === s;
                        return (
                          <button 
                            key={s}
                            onClick={() => updateActiveReelConfig("speed", s)}
                            className={`py-4 px-2 rounded-xl text-center font-bold text-xs cursor-pointer transition-all border ${
                              isSelected 
                                ? "bg-amber-400 border-none text-black" 
                                : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"
                            }`}
                          >
                            {s === 1.0 ? "NORMAL ⚡" : `${s}x ${s < 1 ? "SLOW 🐢" : "FAST 🚀"}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 7. DIALOGUE TEXT EDITOR SUBTITLE */}
                {activeTab === "subtitle" && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button onClick={() => triggerPanelOpen("overlay", "🎭 Overlays Engine")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Layers</button>
                      <button onClick={() => triggerPanelOpen("frame", "🖼️ Borders Frame")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Borders</button>
                      <button onClick={() => triggerPanelOpen("speed", "⚡ Speed Multiplier")} className="flex-1 py-2 rounded-lg text-neutral-300 bg-white/5 text-xs font-bold">Speed</button>
                      <button className="flex-1 py-2 rounded-lg text-black bg-amber-400 text-xs font-bold">Subtitles</button>
                    </div>

                    <div className="p-3 bg-white/2 rounded-xl border border-white/5">
                      <label className="text-xs text-neutral-400 mb-2 block font-semibold">ಡೈಲಾಗ್ ಸಬ್‌ಟೈಟಲ್ ಬರೆಯಿರಿ (Type Subtitle Text)</label>
                      <input 
                        type="text"
                        value={reels[currentFeedIndex]?.subtitle || ""}
                        onChange={(e) => updateActiveReelConfig("subtitle", e.target.value)}
                        placeholder="ಬರೆಯಿರಿ..."
                        className="w-full px-4 py-3 border border-white/10 bg-white/5 rounded-xl text-white font-medium text-sm focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                )}

                {/* 8. SOUNDTRACK MUSIC ENGINE */}
                {activeTab === "audio" && (
                  <div className="flex flex-col h-full overflow-hidden">
                    <input 
                      type="text"
                      value={audioSearchQuery}
                      onChange={(e) => handleMusicSearch(e.target.value)}
                      placeholder="🔍 ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ (KGF, Kantara...)"
                      className="w-full text-sm px-4 py-3 bg-white/5 border border-white/10 rounded-full focus:outline-none text-white focus:border-amber-400 mb-3"
                    />

                    {/* Kannada Category rows */}
                    <div className="flex gap-2 overflow-x-auto pb-3 flex-shrink-0" style={{ scrollbarWidth: "none" }}>
                      {KANNADA_PLAYLISTS.map((p) => (
                        <div 
                          key={p.name}
                          onClick={() => handleMusicSearch(p.term)}
                          className="flex-shrink-0 flex items-center gap-2 bg-white/5 p-1.5 pr-3.5 rounded-full border border-white/5 hover:bg-white/10 cursor-pointer text-xs"
                        >
                          <img src={p.img} className="w-6 h-6 rounded-full object-cover" />
                          <span className="font-bold text-neutral-300">{p.name}</span>
                        </div>
                      ))}
                    </div>

                    {/* Song results vertical listing */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: "thin" }}>
                      {isSearchingMusic && (
                        <div className="py-6 text-center text-xs font-mono text-neutral-400">
                          Searching tracks database...
                        </div>
                       )}

                      {!isSearchingMusic && searchResults.map((track) => {
                        const isAssigned = reels[currentFeedIndex]?.audioTrackUrl === track.previewUrl;
                        return (
                          <div 
                            key={track.trackId || track.previewUrl}
                            onClick={() => assignSoundtrackToReel(track.previewUrl, `${track.trackName} - ${track.artistName}`)}
                            className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer border ${
                              isAssigned 
                                ? "bg-amber-400/10 border-amber-400/30" 
                                : "bg-white/3 border-white/5 hover:bg-white/6"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-width-0">
                              <img src={track.artworkUrl60} className="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-white/5" />
                              <div className="text-left leading-tight">
                                <p className="text-xs font-bold text-white max-w-[200px] truncate">{track.trackName}</p>
                                <p className="text-[10px] text-neutral-400 max-w-[200px] truncate mt-0.5">{track.artistName}</p>
                              </div>
                            </div>
                            
                            <button className="p-2 bg-white/5 hover:bg-white/15 rounded-full border border-white/10 text-white cursor-pointer flex-shrink-0">
                              {isAssigned ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FOOTER COHESIVE INTERFACE ROW NAV */}
      <div id="bottom-studio-row-nav" className="fixed bottom-0 inset-x-0 h-[64px] bg-black border-t border-white/10 flex justify-around items-center z-[500] safe-bottom select-none">
        
        <button 
          onClick={() => triggerPanelOpen("lut", "📽️ Cinema Film Filters [ಫಿಲ್ಮ ಪ್ರಸ್ತುತಿಗಳು]")}
          className={`flex flex-col items-center justify-center text-[10px] font-bold h-full w-[17%] cursor-pointer transition-colors ${
            activeTab === "lut" ? "text-amber-400" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Film className="w-5 h-5 mb-1" />
          <span>Filters</span>
        </button>

        <button 
          onClick={() => triggerPanelOpen("motion", "🌀 FX Magic Vibration [ಕೆಟ್ಟ ಪರಿಣಾಮಗಳು]")}
          className={`flex flex-col items-center justify-center text-[10px] font-bold h-full w-[17%] cursor-pointer transition-colors ${
            activeTab === "motion" ? "text-amber-400" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-5 h-5 mb-1 animate-pulse" />
          <span>FX Magic</span>
        </button>

        <button 
          onClick={() => triggerPanelOpen("audio", "🎵 Real Sound Engine [ಹಾಡುಗಳು]")}
          className={`flex flex-col items-center justify-center text-[10px] font-bold h-full w-[17%] cursor-pointer transition-colors ${
            activeTab === "audio" ? "text-amber-400" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Music className="w-5 h-5 mb-1" />
          <span>Music</span>
        </button>

        <button 
          onClick={() => triggerPanelOpen("color", "🎨 Pro Color Grading [ಬಣ್ಣ ಪ್ರಸ್ತುತಿಗಳು]")}
          className={`flex flex-col items-center justify-center text-[10px] font-bold h-full w-[17%] cursor-pointer transition-colors ${
            activeTab === "color" ? "text-amber-400" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Sliders className="w-5 h-5 mb-1" />
          <span>Grading</span>
        </button>

        <button 
          onClick={() => triggerPanelOpen("overlay", "🎭 More Cinema Options [ಹೆಚ್ಚಿನ ಆಯ್ಕೆಗಳು]")}
          className={`flex flex-col items-center justify-center text-[10px] font-bold h-full w-[17%] cursor-pointer transition-colors ${
            ["overlay", "frame", "speed", "subtitle"].includes(activeTab || "") ? "text-amber-400" : "text-neutral-400 hover:text-white"
          }`}
        >
          <MoreHorizontal className="w-5 h-5 mb-1" />
          <span>More FX</span>
        </button>

      </div>

    </div>
  );
}

// Separate component for high performance tick interval updates targeting only the progress DOM
function IntervalSyncComponent({ currentFeedIndex, reels }: { currentFeedIndex: number; reels: Reel[] }) {
  useEffect(() => {
    const handleProg = setInterval(() => {
      const activeVideo = document.getElementById(`video_feed_${currentFeedIndex}`) as HTMLVideoElement | null;
      const activeBar = document.getElementById(`progress_bar_${currentFeedIndex}`) as HTMLDivElement | null;
      if (activeVideo && activeBar && activeVideo.duration) {
        const percentage = (activeVideo.currentTime / activeVideo.duration) * 100;
        activeBar.style.width = `${percentage}%`;
      }
    }, 120);

    return () => clearInterval(handleProg);
  }, [currentFeedIndex, reels]);

  return null;
}