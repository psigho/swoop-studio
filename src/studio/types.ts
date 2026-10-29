export type PointerSample = {
  t: number;
  x: number;
  y: number;
  click?: boolean;
  visible?: boolean;
  event?: "move" | "down" | "up";
  pressed?: boolean;
  button?: number;
};
export type TypingBurst = { start: number; end: number; x: number; y: number };
export type ZoomRegion = {
  id: string;
  start: number;
  end: number;
  x: number;
  y: number;
  scale: number;
};
export type StudioSettings = {
  background: "lagoon" | "sunset" | "mono" | "candy" | "mesh" | "cream";
  padding: number;
  roundness: number;
  shadow: number;
  aspect: "16:9" | "9:16" | "1:1" | "4:3";
  cursorStyle:
    | "arrow"
    | "dot"
    | "ring"
    | "crosshair"
    | "hand"
    | "presenter"
    | "outline"
    | "neon"
    | "spotlight";
  showCursor: boolean;
  cursorColor: string;
  cursorSize: number;
  cursorTrail: boolean;
  trailStyle: "ribbon" | "comet" | "ghost";
  trailDuration: number;
  trailOpacity: number;
  clickRipple: boolean;
  clickStyle: "ripple" | "pulse" | "burst" | "ring";
  clickColor: string;
  clickSize: number;
  dragEffect: boolean;
  dragStyle: "elastic" | "path" | "selection";
  dragColor: string;
  smoothing: number;
  motion: "smooth" | "snappy" | "float";
  cameraFrame: "none" | "mac" | "browser";
  intro: "none" | "rise" | "swoop" | "pop";
  grain: boolean;
};

export const DEFAULT_SETTINGS: StudioSettings = {
  background: "lagoon",
  padding: 54,
  roundness: 18,
  shadow: 55,
  aspect: "16:9",
  cursorStyle: "arrow",
  showCursor: true,
  cursorColor: "#ffffff",
  cursorSize: 32,
  cursorTrail: false,
  trailStyle: "ribbon",
  trailDuration: 0.45,
  trailOpacity: 70,
  clickRipple: true,
  clickStyle: "ripple",
  clickColor: "#f6b75a",
  clickSize: 72,
  dragEffect: true,
  dragStyle: "elastic",
  dragColor: "#a4dacb",
  smoothing: 65,
  motion: "smooth",
  cameraFrame: "mac",
  intro: "swoop",
  grain: true,
};

export type FrameOptions = {
  width: number;
  height: number;
  time: number;
  duration: number;
  settings: StudioSettings;
  zooms: ZoomRegion[];
  pointers: PointerSample[];
  video?: HTMLVideoElement;
  isDemo: boolean;
};

export type ExportOptions = {
  sourceUrl?: string;
  isDemo: boolean;
  duration: number;
  trimStart: number;
  trimEnd: number;
  settings: StudioSettings;
  zooms: ZoomRegion[];
  pointers: PointerSample[];
  width?: number;
  fps?: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};
