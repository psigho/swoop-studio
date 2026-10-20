import type { PointerSample } from "./studio";
import type { NativeSource } from "./recording";

export type PointerCaptureStatus = {
  clicksSupported: boolean;
  pointerSupported: boolean;
  scope: "display" | "window-initial-bounds" | "unavailable";
  bounds?: { x: number; y: number; width: number; height: number };
  warning: string;
  /** Epoch milliseconds at the first pointer sample, for media alignment. */
  startedAt?: number;
};

export type NativeExportProgress = {
  stage: "preparing" | "encoding" | "complete" | "error";
  ratio?: number;
  seconds?: number;
  path?: string;
  error?: string;
};

export type NativeFileResult = {
  canceled?: boolean;
  path?: string;
  error?: string;
};

export type SavedTake = {
  id: string;
  name: string;
  createdAt: string;
  bytes: number;
  duration?: number;
  width: number;
  height: number;
  state: "ready" | "interrupted";
  path: string;
  hasCursorData: boolean;
};

export interface SwoopBridge {
  getSources(): Promise<NativeSource[]>;
  selectSource(id: string): Promise<boolean>;
  startPointerCapture(id?: string): Promise<PointerCaptureStatus>;
  pausePointerCapture(paused: boolean): Promise<boolean>;
  stopPointerCapture(): Promise<PointerSample[]>;
  saveVideo(options: {
    bytes: ArrayBuffer | Uint8Array;
    name: string;
    format: "webm" | "mp4";
  }): Promise<NativeFileResult>;
  saveProject(data: object): Promise<NativeFileResult>;
  openProject(): Promise<NativeFileResult & { data?: Record<string, unknown> }>;
  beginTake(details: {
    name: string;
    mimeType: string;
    width: number;
    height: number;
  }): Promise<{ id: string; path: string }>;
  appendTakeChunk(id: string, bytes: ArrayBuffer | Uint8Array): Promise<void>;
  completeTake(id: string, details: {
    duration: number;
    pointers: PointerSample[];
    warnings: string[];
  }): Promise<void>;
  interruptTake(id: string): Promise<void>;
  listTakes(): Promise<{ directory: string; takes: SavedTake[] }>;
  openTake(id: string): Promise<{
    take: SavedTake;
    bytes: Uint8Array;
    pointers: PointerSample[];
    mimeType: string;
  }>;
  showTakesFolder(): Promise<void>;
  getAppInfo(): Promise<{
    version: string;
    platform: string;
    ffmpeg: boolean;
    clicksSupported: boolean;
    desktop: boolean;
    projectSizeLimitMB: number;
  }>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  onExportProgress(
    callback: (progress: NativeExportProgress) => void,
  ): () => void;
}

declare global {
  interface Window {
    /** Present only inside the trusted Electron renderer. */
    swoop?: SwoopBridge;
  }
}
