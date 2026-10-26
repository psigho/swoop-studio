import type { SwoopBridge } from "./bridge";

/** Decode into a cursor-free canvas track. Acknowledgements bound native/IPC memory. */
export async function cleanScreenTrack(bridge: SwoopBridge, sourceId: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("The recording canvas could not start.");
  let id: string | undefined;
  let stopped = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let firstResolve!: () => void;
  let firstReject!: (error: Error) => void;
  let onEnded: (() => void) | undefined;
  let failure: Error | undefined;
  const firstFrame = new Promise<void>((resolve, reject) => {
    firstResolve = resolve;
    firstReject = reject;
  });
  const remove = bridge.onCleanFrame(async (frame) => {
    if (stopped || frame.id !== id) return;
    if (frame.error) {
      failure = new Error(frame.error);
      firstReject(failure);
      onEnded?.();
      return;
    }
    try {
      if (!frame.bytes) throw new Error("The capture frame was empty.");
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(frame.bytes)], { type: "image/jpeg" }),
      );
      if (!stopped) {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        ctx.drawImage(bitmap, 0, 0);
        firstResolve();
      }
      bitmap.close();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      firstReject(failure);
      onEnded?.();
    } finally {
      if (!stopped) bridge.ackCleanFrame(frame.id);
    }
  });
  const stop = async () => {
    stopped = true;
    remove();
    if (heartbeat) clearInterval(heartbeat);
    if (id) await bridge.stopCleanCapture(id);
  };
  try {
    const started = await bridge.startCleanCapture(sourceId);
    id = started.id;
    bridge.ackCleanFrame(id);
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        firstFrame,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "The cursor-free recording source did not become ready.",
                ),
              ),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
    const stream = canvas.captureStream(60);
    // WGC sends changes, not a guaranteed fixed cadence. Keep a stationary
    // screen on the recording clock too, including video-only recordings.
    heartbeat = setInterval(() => {
      if (!stopped) ctx.drawImage(canvas, 0, 0);
    }, 1000 / 60);
    return {
      stream,
      stop,
      onEnded(callback: () => void) {
        onEnded = callback;
        if (failure) callback();
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
