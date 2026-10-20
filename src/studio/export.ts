import { outputDimensions } from "./motion";
import { renderFrame } from "./renderer";
import type { ExportOptions } from "./types";
import { withWebmDuration } from "./webm";

function abortError() {
  return new DOMException("Export cancelled", "AbortError");
}
function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function waitForMedia(
  video: HTMLVideoElement,
  event: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        finish(
          new Error(
            "The video took too long to load. Please try importing it again.",
          ),
        ),
      20000,
    );
    const ready = () => finish();
    const error = () =>
      finish(
        new Error(video.error?.message || "This video could not be decoded."),
      );
    const aborted = () => finish(abortError());
    function finish(failure?: Error) {
      window.clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", error);
      signal?.removeEventListener("abort", aborted);
      if (failure) reject(failure);
      else resolve();
    }
    video.addEventListener(event, ready, { once: true });
    video.addEventListener("error", error, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

/** Real-time canvas export works locally, including in an offline Electron window. */
export async function exportVideo(options: ExportOptions): Promise<Blob> {
  const { settings, pointers, zooms, isDemo, signal, onProgress } = options;
  throwIfAborted(signal);
  if (!isDemo && !options.sourceUrl)
    throw new Error("Choose a video or record your screen before exporting.");
  if (!Number.isFinite(options.duration) || options.duration <= 0)
    throw new Error("This project has no video duration.");
  const start = Math.max(
    0,
    Math.min(options.trimStart, options.duration - 0.05),
  );
  const end = Math.min(
    options.duration,
    Math.max(start + 0.05, options.trimEnd),
  );
  const duration = end - start;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Choose a valid trim range before exporting.");
  const fps = Math.max(15, Math.min(60, options.fps ?? 30));
  const dimensions = outputDimensions(
    settings.aspect,
    options.width ?? (settings.aspect === "9:16" ? 1080 : 1920),
  );
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx)
    throw new Error("Canvas rendering is not available on this device.");
  let video: HTMLVideoElement | undefined;
  let audio: AudioContext | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let frameTimer: number | undefined;
  let activeAbort: (() => void) | undefined;
  try {
    if (!isDemo) {
      video = document.createElement("video");
      video.preload = "auto";
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = options.sourceUrl!;
      const loaded = waitForMedia(video, "loadeddata", signal);
      video.load();
      await loaded;
      if (Math.abs(video.currentTime - start) > 0.002) {
        const seeked = waitForMedia(video, "seeked", signal);
        video.currentTime = start;
        await seeked;
      }
    }
    throwIfAborted(signal);
    const render = (time: number) =>
      renderFrame(ctx, {
        ...dimensions,
        time,
        duration: options.duration,
        settings,
        zooms,
        pointers,
        video,
        isDemo,
      });
    render(start);
    stream = canvas.captureStream(fps);
    const canvasTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
      requestFrame?: () => void;
    };
    if (video) {
      audio = new AudioContext();
      source = audio.createMediaElementSource(video);
      const destination = audio.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks())
        stream.addTrack(track);
      await audio.resume();
    }
    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      throw new Error(
        "Your browser does not support WebM export. Open this project in the desktop app.",
      );
    const bitRate = Math.round(
      Math.min(
        32_000_000,
        Math.max(6_000_000, dimensions.width * dimensions.height * fps * 0.16),
      ),
    );
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitRate,
      audioBitsPerSecond: 192000,
    });
    const chunks: Blob[] = [];
    let recordingFailure: Error | undefined;
    const completed = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder!.onerror = (event) => {
        recordingFailure = new Error(
          (event as Event & { error?: DOMException }).error?.message ||
            "Video encoding failed.",
        );
        if (recorder!.state !== "inactive") recorder!.stop();
        else reject(recordingFailure);
      };
      recorder!.onstop = () => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        if (recordingFailure) {
          reject(recordingFailure);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size)
          reject(
            new Error("The encoder returned an empty file. Please try again."),
          );
        else resolve(blob);
      };
    });
    // Attach a rejection handler immediately; playback may fail before the await.
    void completed.catch(() => undefined);
    onProgress?.(0);
    const recordingBegan = performance.now();
    recorder.start(250);
    if (video) await video.play();
    const began = performance.now();
    let frames = 0;
    await new Promise<void>((resolve, reject) => {
      const finish = (failure?: Error) => {
        if (frameTimer !== undefined) {
          window.clearTimeout(frameTimer);
          frameTimer = undefined;
        }
        signal?.removeEventListener("abort", activeAbort!);
        activeAbort = undefined;
        if (failure) reject(failure);
        else resolve();
      };
      activeAbort = () => finish(abortError());
      signal?.addEventListener("abort", activeAbort, { once: true });
      if (signal?.aborted) {
        activeAbort();
        return;
      }
      const frame = () => {
        try {
          const elapsed = (performance.now() - began) / 1000;
          if (recordingFailure) {
            finish(recordingFailure);
            return;
          }
          const at = isDemo ? start + elapsed : video!.currentTime;
          render(Math.min(end, at));
          canvasTrack.requestFrame?.();
          const progress = Math.min(
            0.995,
            Math.max(0, (at - start) / duration),
          );
          if (frames++ % 3 === 0) onProgress?.(progress);
          if (
            at >= end - 1 / fps ||
            (video?.ended && elapsed > 0.1) ||
            (isDemo && elapsed >= duration)
          ) {
            // Keep the final requested frame alive for a complete display interval.
            render(Math.max(start, end - 0.001));
            canvasTrack.requestFrame?.();
            frameTimer = window.setTimeout(() => finish(), 1000 / fps + 20);
          } else if (elapsed > duration + 20) {
            finish(
              new Error(
                "Video playback stalled during export. Please try exporting again.",
              ),
            );
          } else {
            frameTimer = window.setTimeout(frame, Math.max(1, 1000 / fps - 1));
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      };
      frame();
    });
    video?.pause();
    if (recorder.state !== "inactive") recorder.stop();
    const recordedDuration = (performance.now() - recordingBegan) / 1000;
    const blob = await completed;
    const seekable = await withWebmDuration(blob, recordedDuration);
    throwIfAborted(signal);
    onProgress?.(1);
    return seekable;
  } finally {
    if (frameTimer !== undefined) window.clearTimeout(frameTimer);
    if (activeAbort) signal?.removeEventListener("abort", activeAbort);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    if (audio && audio.state !== "closed")
      await audio.close().catch(() => undefined);
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}
