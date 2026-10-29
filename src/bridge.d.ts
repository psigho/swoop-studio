import type { PointerSample, TypingBurst } from "./studio";
import type { NativeSource } from "./recording";

export type PointerCaptureStatus = {
  clicksSupported: boolean;
  pointerSupported: boolean;
  typingSupported?: boolean;
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
  startCleanCapture(id: string): Promise<{ id: string }>;
  stopCleanCapture(id: string): Promise<void>;
  ackCleanFrame(id: string): void;
  onCleanFrame(
    callback: (frame: {
      id: string;
      bytes?: Uint8Array;
      error?: string;
    }) => void,
  ): () => void;
  openSoundSettings(): Promise<void>;
  getSystemOutputs(): Promise<
    { id: string; name: string; isDefault: boolean }[]
  >;
  startSystemAudio(
    id: string,
  ): Promise<{ id: string; sampleRate: number; channels: number }>;
  stopSystemAudio(id: string): Promise<void>;
  ackSystemAudio(id: string): void;
  onSystemAudio(
    callback: (packet: {
      id: string;
      bytes?: Uint8Array;
      error?: string;
    }) => void,
  ): () => void;
  startPointerCapture(
    id?: string,
    options?: { typingZoom?: boolean },
  ): Promise<PointerCaptureStatus>;
  pausePointerCapture(paused: boolean): Promise<boolean>;
  stopPointerCapture(): Promise<PointerSample[]>;
  stopCaptureData(): Promise<{
    pointers: PointerSample[];
    typing: TypingBurst[];
  }>;
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
  completeTake(
    id: string,
    details: {
      duration: number;
      pointers: PointerSample[];
      typing?: TypingBurst[];
      warnings: string[];
    },
  ): Promise<void>;
  interruptTake(id: string): Promise<void>;
  listTakes(): Promise<{ directory: string; takes: SavedTake[] }>;
  openTake(id: string): Promise<{
    take: SavedTake;
    bytes: Uint8Array;
    pointers: PointerSample[];
    typing?: TypingBurst[];
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
