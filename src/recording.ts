import type { PointerSample } from "./studio";
import { cleanScreenTrack } from "./clean-capture";
import {
  createRecordingBackup,
  recordingTakeName,
  type RecordingBackup,
  type RecordingBackupStatus,
} from "./recording-backup";

export type NativeSource = {
  id: string;
  name: string;
  thumbnail: string;
  dataURL?: string;
  displayId: string;
  kind: "screen" | "window";
  icon?: string | null;
  isSelf?: boolean;
};

export type RecordingConfig = {
  sourceId?: string;
  microphone: boolean;
  microphoneDeviceId?: string;
  microphoneChannel?: "all" | "left" | "right";
  systemAudio: boolean;
  onElapsed?: (seconds: number) => void;
  /** Called when the source ends or recording fails, so the UI can finish it. */
  onEnded?: () => void;
  /** Local desktop backup progress; browser recordings do not create a backup. */
  onBackupStatus?: (status: RecordingBackupStatus) => void;
};

export type RecordingResult = {
  blob: Blob;
  pointers: PointerSample[];
  duration: number;
  width: number;
  height: number;
  warnings: string[];
  /** Present only when every recorded byte and the take metadata were saved. */
  backupPath?: string;
};

export interface RecordingSession {
  pause(): void;
  resume(): void;
  stop(): Promise<RecordingResult>;
  elapsed(): number;
}

type CursorConstraints = MediaTrackConstraints & {
  cursor?: "always" | "motion" | "never";
};
type CursorSettings = MediaTrackSettings & {
  cursor?: "always" | "motion" | "never";
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function captureError(error: unknown): Error {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError")
    return new Error(
      "Screen capture was cancelled or permission was denied. Choose New video to try again.",
    );
  if (name === "NotReadableError")
    return new Error(
      "Windows could not read that screen or window. Check that it is still open, then choose it again.",
    );
  if (name === "InvalidStateError")
    return new Error(
      "Choose New video in the active Swoop window to open the screen picker.",
    );
  return new Error(`Screen capture could not start: ${message(error)}`);
}

/** Record media and cursor events together. Nothing is uploaded or monitored before this call. */
export async function startRecording(
  config: RecordingConfig,
): Promise<RecordingSession> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      "Screen capture is unavailable here. Open Swoop Studio on the desktop, or use a supported browser on localhost.",
    );
  }
  if (typeof MediaRecorder === "undefined")
    throw new Error(
      "This browser cannot record video. Open the Swoop desktop application.",
    );

  const native = window.swoop;
  const warnings: string[] = [];
  const ownedTracks = new Set<MediaStreamTrack>();
  const audioNodes: AudioNode[] = [];
  let audioContext: AudioContext | undefined;
  let pointerCaptureStarted = false;
  let pointerLead = 0;
  let videoTrack: MediaStreamTrack | undefined;
  let recorder: MediaRecorder | undefined;
  let backup: RecordingBackup | undefined;
  let elapsedTimer: ReturnType<typeof setInterval> | undefined;
  let cleanupDone = false;
  let removeEnded: (() => void) | undefined;
  let cleanCapture: Awaited<ReturnType<typeof cleanScreenTrack>> | undefined;

  const warn = (value: string) => {
    if (value && !warnings.includes(value)) warnings.push(value);
  };
  const own = (stream: MediaStream) => {
    stream.getTracks().forEach((track) => ownedTracks.add(track));
    return stream;
  };
  const cleanMedia = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    if (elapsedTimer) clearInterval(elapsedTimer);
    removeEnded?.();
    try {
      await cleanCapture?.stop();
    } catch {
      /* Release every owned media track even if IPC has gone away. */
    }
    for (const node of audioNodes) {
      try {
        node.disconnect();
      } catch {
        /* Already disconnected. */
      }
    }
    for (const track of ownedTracks) track.stop();
    if (audioContext && audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch {
        /* Tracks are already closed. */
      }
    }
  };

  try {
    if (native && config.sourceId) {
      if (!(await native.selectSource(config.sourceId)))
        throw new Error(
          "That screen or window is no longer available. Choose a source again.",
        );
    }

    let display: MediaStream;
    try {
      display = own(
        await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 60 } },
          audio: config.systemAudio,
          // Chromium uses these as hints. Availability is checked on the returned tracks.
          ...({
            systemAudio: config.systemAudio ? "include" : "exclude",
            selfBrowserSurface: "exclude",
          } as object),
        }),
      );
    } catch (error) {
      throw captureError(error);
    }

    videoTrack = display
      .getVideoTracks()
      .find((track) => track.readyState === "live");
    if (!videoTrack)
      throw new Error(
        "The selected source did not provide a live video track. Choose another screen or window.",
      );

    if (
      native &&
      config.sourceId &&
      (await native.getAppInfo()).platform === "win32"
    ) {
      try {
        cleanCapture = await cleanScreenTrack(native, config.sourceId);
        videoTrack = own(cleanCapture.stream).getVideoTracks()[0];
        cleanCapture.onEnded(() => {
          warn(
            "The selected screen or window stopped providing frames. The take has been stopped and its backup kept.",
          );
          videoTrack?.stop();
          videoTrack?.dispatchEvent(new Event("ended"));
        });
      } catch (error) {
        throw new Error(
          `Cursor-free capture could not start: ${message(error)}. Keep the selected window visible, or choose a full display.`,
        );
      }
    }

    const audioTracks: MediaStreamTrack[] = config.systemAudio
      ? display.getAudioTracks().filter((track) => track.readyState === "live")
      : [];
    if (config.systemAudio && audioTracks.length === 0) {
      warn(
        "System audio was requested but this source did not provide it. Choose a full display or an audio-enabled browser tab to capture sound.",
      );
    }

    let microphoneTrack: MediaStreamTrack | undefined;
    if (config.microphone) {
      let microphone: MediaStream;
      try {
        microphone = own(
          await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              ...(config.microphoneDeviceId &&
              config.microphoneDeviceId !== "default"
                ? { deviceId: { exact: config.microphoneDeviceId } }
                : {}),
              channelCount: { ideal: 2 },
              echoCancellation:
                !config.microphoneChannel || config.microphoneChannel === "all",
              noiseSuppression:
                !config.microphoneChannel || config.microphoneChannel === "all",
              autoGainControl:
                !config.microphoneChannel || config.microphoneChannel === "all",
            },
          }),
        );
      } catch (error) {
        throw new Error(
          `Microphone access failed: ${message(error)}. Allow microphone access, connect a microphone, or turn Microphone off before recording.`,
        );
      }
      const microphoneTracks = microphone
        .getAudioTracks()
        .filter((track) => track.readyState === "live");
      if (!microphoneTracks.length)
        throw new Error(
          "The microphone did not provide a live audio track. Choose a working microphone or turn Microphone off.",
        );
      audioTracks.push(...microphoneTracks);
      microphoneTrack = microphoneTracks[0];
      if (
        config.microphoneChannel === "right" &&
        (microphoneTrack.getSettings().channelCount ?? 1) < 2
      )
        throw new Error(
          "This microphone has one channel. Choose All / mono or Left channel in recording setup.",
        );
    }

    const recordingStream = own(new MediaStream([videoTrack]));
    if (audioTracks.length) {
      try {
        audioContext = new AudioContext();
        await audioContext.resume();
        if (audioContext.state !== "running")
          throw new Error("The audio mixer could not start.");
        const destination = audioContext.createMediaStreamDestination();
        own(destination.stream);
        for (const track of audioTracks) {
          const node = audioContext.createMediaStreamSource(
            new MediaStream([track]),
          );
          if (
            track === microphoneTrack &&
            config.microphoneChannel &&
            config.microphoneChannel !== "all"
          ) {
            const splitter = audioContext.createChannelSplitter(2);
            const mono = audioContext.createGain();
            mono.channelCount = 1;
            mono.channelCountMode = "explicit";
            node.connect(splitter);
            splitter.connect(
              mono,
              config.microphoneChannel === "right" ? 1 : 0,
            );
            mono.connect(destination);
            audioNodes.push(splitter, mono);
          } else node.connect(destination);
          audioNodes.push(node);
        }
        // Only the recorder receives this mix. It never connects to speakers.
        destination.stream
          .getAudioTracks()
          .forEach((track) => recordingStream.addTrack(track));
      } catch (error) {
        throw new Error(
          `Recording audio could not start: ${message(error)}. Check the audio devices or turn audio off.`,
        );
      }
    }

    let pointerStartedAt: number | undefined;
    if (native) {
      try {
        const status = await native.startPointerCapture(config.sourceId);
        pointerCaptureStarted = status.pointerSupported;
        pointerStartedAt = status.startedAt;
        if (status.warning) warn(status.warning);
        if (status.pointerSupported) {
          if (!status.clicksSupported)
            warn(
              "Cursor movement is recorded, but click detection is unavailable. Add zoom regions manually after recording.",
            );
          if (!cleanCapture)
            try {
              // `advanced` is forbidden in getDisplayMedia options, so apply it afterward.
              await videoTrack.applyConstraints({
                advanced: [{ cursor: "never" } as CursorConstraints],
              });
              const cursor = (videoTrack.getSettings() as CursorSettings)
                .cursor;
              if (cursor !== "never") {
                pointerCaptureStarted = false;
                await native.stopPointerCapture();
                warn(
                  "This source keeps its original cursor. Editable cursor effects are disabled for this take to avoid a double cursor.",
                );
              }
            } catch {
              pointerCaptureStarted = false;
              await native.stopPointerCapture();
              warn(
                "This source keeps its original cursor. Editable cursor effects are disabled for this take to avoid a double cursor.",
              );
            }
        } else {
          warn(
            "Editable cursor tracking is unavailable for this source. The recording keeps its original cursor.",
          );
        }
      } catch (error) {
        warn(
          `Editable cursor tracking could not start: ${message(error)}. The recording keeps its original cursor.`,
        );
        // A partial native startup must not leave a global hook running.
        try {
          await native.stopPointerCapture();
        } catch {
          /* Main process also owns hook cleanup. */
        }
      }
    } else {
      warn(
        "Browser recordings keep the original cursor. Use the desktop app to record editable cursor movement and clicks.",
      );
    }

    if (cleanCapture && !pointerCaptureStarted)
      throw new Error(
        "Cursor tracking could not start for this source. Choose a full display and try again.",
      );

    if (videoTrack.readyState !== "live")
      throw new Error(
        "The screen source ended before recording started. Choose New video to try again.",
      );
    const mimeTypes = audioTracks.length
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
        ]
      : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeTypes.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType)
      throw new Error(
        "WebM recording is unavailable. Open the Swoop desktop application to record this source.",
      );
    recorder = new MediaRecorder(recordingStream, {
      mimeType,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    const activeRecorder = recorder;
    const chunks: Blob[] = [];
    let recordingError: Error | undefined;
    let startedAt = 0;
    let pausedAt: number | undefined;
    let pausedDuration = 0;
    let frozenDuration: number | undefined;
    let stopPromise: Promise<RecordingResult> | undefined;
    let pointerOperations = Promise.resolve();
    let endedNotified = false;
    let resolveRecorderStopped!: () => void;
    const recorderStopped = new Promise<void>((resolve) => {
      resolveRecorderStopped = resolve;
    });

    const elapsed = () =>
      frozenDuration ??
      Math.max(
        0,
        ((pausedAt ?? performance.now()) - startedAt - pausedDuration) / 1000,
      );
    const emitElapsed = () => {
      try {
        config.onElapsed?.(elapsed());
      } catch {
        /* UI callbacks cannot stop media capture. */
      }
    };
    const setNativePaused = (paused: boolean) => {
      if (!native || !pointerCaptureStarted) return;
      pointerOperations = pointerOperations.then(async () => {
        try {
          await native.pausePointerCapture(paused);
        } catch (error) {
          warn(`Cursor pause synchronization failed: ${message(error)}`);
        }
      });
    };

    const session: RecordingSession = {
      elapsed,
      pause() {
        if (stopPromise || activeRecorder.state !== "recording") return;
        activeRecorder.pause();
        pausedAt = performance.now();
        setNativePaused(true);
        emitElapsed();
      },
      resume() {
        if (stopPromise || activeRecorder.state !== "paused") return;
        activeRecorder.resume();
        if (pausedAt !== undefined)
          pausedDuration += performance.now() - pausedAt;
        pausedAt = undefined;
        setNativePaused(false);
        emitElapsed();
      },
      stop() {
        if (stopPromise) return stopPromise;
        frozenDuration = elapsed();
        if (elapsedTimer) clearInterval(elapsedTimer);
        removeEnded?.();
        stopPromise = (async () => {
          let pointers: PointerSample[] = [];
          const finishPointers = (async () => {
            await pointerOperations;
            if (native && pointerCaptureStarted) {
              try {
                const samples = await native.stopPointerCapture();
                const valid = samples.filter(
                  (sample) =>
                    Number.isFinite(sample.t) &&
                    Number.isFinite(sample.x) &&
                    Number.isFinite(sample.y),
                );
                pointers = valid
                  .filter(
                    (sample) =>
                      sample.t >= pointerLead &&
                      sample.t <= (frozenDuration ?? 0) + pointerLead,
                  )
                  .map((sample) => ({ ...sample, t: sample.t - pointerLead }));
                // Keep the starting position without replaying a press from encoder setup.
                let initial: PointerSample | undefined;
                for (let index = valid.length - 1; index >= 0; index--) {
                  if (valid[index].t <= pointerLead) {
                    initial = valid[index];
                    break;
                  }
                }
                if (initial && (!pointers.length || pointers[0].t > 0.03)) {
                  const { button: _button, ...position } = initial;
                  pointers.unshift({
                    ...position,
                    t: 0,
                    click: false,
                    event: "move",
                    pressed: false,
                  });
                }
                // The native stop arrives a few milliseconds after the video
                // clock freezes. If trimming excluded its release, close the
                // held gesture on the video's final frame instead.
                const last = pointers.at(-1);
                if (last?.pressed) {
                  pointers.push({
                    ...last,
                    t: frozenDuration ?? last.t,
                    click: false,
                    event: "up",
                    pressed: false,
                  });
                }
              } catch (error) {
                warn(`Cursor data could not be read: ${message(error)}`);
              }
              pointerCaptureStarted = false;
            }
          })();
          try {
            if (activeRecorder.state !== "inactive") activeRecorder.stop();
            await recorderStopped;
            await finishPointers;
            if (recordingError) throw recordingError;
            const blob = new Blob(chunks, {
              type: activeRecorder.mimeType || mimeType,
            });
            if (!blob.size)
              throw new Error(
                "The recorder produced an empty file. Record for a little longer and try again.",
              );
            const settings = videoTrack!.getSettings();
            // The stop event follows the final dataavailable event. Drain every
            // queued disk write before finalizing metadata or reporting saved.
            const backupPath = await backup?.complete({
              duration: frozenDuration ?? 0,
              pointers,
              warnings: [...warnings],
            });
            return {
              blob,
              pointers,
              duration: frozenDuration ?? 0,
              width: settings.width || 1920,
              height: settings.height || 1080,
              warnings: [...warnings],
              ...(backupPath ? { backupPath } : {}),
            };
          } finally {
            await finishPointers;
            await backup?.interrupt();
            await cleanMedia();
          }
        })();
        return stopPromise;
      },
    };

    const sourceEnded = () => {
      if (endedNotified || stopPromise) return;
      endedNotified = true;
      void session
        .stop()
        .catch(() => {
          /* The UI obtains the same error from stop(). */
        })
        .finally(() => {
          try {
            config.onEnded?.();
          } catch {
            /* Capture has been cleaned up. */
          }
        });
    };
    activeRecorder.addEventListener("dataavailable", (event: BlobEvent) => {
      if (event.data.size) {
        chunks.push(event.data);
        backup?.enqueue(event.data);
      }
    });
    activeRecorder.addEventListener("stop", () => {
      resolveRecorderStopped();
      sourceEnded();
    });
    activeRecorder.addEventListener("error", (event: Event) => {
      const error = (event as Event & { error?: DOMException }).error;
      recordingError = new Error(
        `Recording failed: ${error?.message || "The media encoder stopped unexpectedly."}`,
      );
      sourceEnded();
    });

    if (native) {
      const settings = videoTrack.getSettings();
      backup = await createRecordingBackup(
        native,
        {
          name: recordingTakeName(),
          mimeType: activeRecorder.mimeType || mimeType,
          width: settings.width || 1920,
          height: settings.height || 1080,
        },
        (status) => {
          if (status.state === "error" && status.error) warn(status.error);
          try {
            config.onBackupStatus?.(status);
          } catch {
            /* UI callbacks cannot interrupt backup or media capture. */
          }
        },
      );
      if (videoTrack.readyState !== "live")
        throw new Error(
          "The screen source ended while preparing its backup. Choose New video to try again.",
        );
    }

    videoTrack.addEventListener("ended", sourceEnded);
    removeEnded = () => videoTrack?.removeEventListener("ended", sourceEnded);
    startedAt = performance.now();
    pointerLead = pointerStartedAt
      ? Math.max(0, (Date.now() - pointerStartedAt) / 1000)
      : 0;
    activeRecorder.start(1000);
    emitElapsed();
    elapsedTimer = setInterval(emitElapsed, 100);
    return session;
  } catch (error) {
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Cleanup still stops its tracks. */
      }
    }
    if (native && pointerCaptureStarted) {
      try {
        await native.stopPointerCapture();
      } catch {
        /* Main process owns final hook cleanup. */
      }
    }
    await backup?.interrupt();
    await cleanMedia();
    throw error;
  }
}
