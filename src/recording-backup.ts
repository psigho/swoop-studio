import type { PointerSample, TypingBurst } from "./studio";

/** Keep individual IPC messages bounded even if MediaRecorder emits a large blob. */
export const TAKE_IPC_CHUNK_BYTES = 4 * 1024 * 1024;

/** UTC keeps saved names stable across time-zone changes and uses no extension. */
export function recordingTakeName(date = new Date()): string {
  return `Take ${date.toISOString().slice(0, 19).replace("T", " ").replaceAll(":", "-")}`;
}

export type RecordingBackupStatus = {
  state: "saving" | "saved" | "error";
  path?: string;
  error?: string;
};

export type TakeBackupMetadata = {
  name: string;
  mimeType: string;
  width: number;
  height: number;
};

export type TakeBackupCompletion = {
  duration: number;
  pointers: PointerSample[];
  typing?: TypingBurst[];
  warnings: string[];
};

export interface TakeBackupBridge {
  beginTake(
    metadata: TakeBackupMetadata,
  ): Promise<{ id: string; path: string }>;
  appendTakeChunk(id: string, bytes: ArrayBuffer | Uint8Array): Promise<void>;
  completeTake(id: string, metadata: TakeBackupCompletion): Promise<void>;
  interruptTake(id: string): Promise<void>;
}

export interface RecordingBackup {
  readonly path: string;
  /** Enqueue synchronously from dataavailable, keeping the recorder unblocked. */
  enqueue(chunk: Blob): void;
  /** Call after MediaRecorder's stop event, which follows its final dataavailable. */
  complete(metadata: TakeBackupCompletion): Promise<string | undefined>;
  /** Release the active take without deleting any accepted recording bytes. */
  interrupt(): Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Serialize blob reads as well as writes: asynchronous arrayBuffer() calls must
 * not reorder WebM chunks. A failed write leaves the partial take untouched and
 * prevents completion from claiming that its incomplete bytes were saved.
 */
export async function createRecordingBackup(
  bridge: TakeBackupBridge,
  metadata: TakeBackupMetadata,
  onStatus?: (status: RecordingBackupStatus) => void,
): Promise<RecordingBackup> {
  const emit = (status: RecordingBackupStatus) => {
    try {
      onStatus?.(status);
    } catch {
      /* An observer cannot interrupt a recording or its backup. */
    }
  };
  emit({ state: "saving" });
  let take: { id: string; path: string };
  try {
    take = await bridge.beginTake(metadata);
    if (!take.id || !take.path)
      throw new Error("The recording folder did not return a valid take.");
  } catch (error) {
    const detail = `Automatic recording backup could not start: ${message(error)}. Check that the recording folder is writable and has free space, then try New video again.`;
    emit({ state: "error", error: detail });
    throw new Error(detail);
  }
  emit({ state: "saving", path: take.path });

  let queue = Promise.resolve();
  let failed = false;
  let completion: Promise<string | undefined> | undefined;
  let interruption: Promise<void> | undefined;
  let interrupted = false;
  const fail = (error: unknown) => {
    if (failed) return;
    failed = true;
    emit({
      state: "error",
      path: take.path,
      error: `Automatic recording backup failed: ${message(error)}. Keep the editor open and Save project or Export to preserve this recording. Any partial backup has been kept.`,
    });
  };
  const interrupt = (): Promise<void> => {
    if (interruption) return interruption;
    interrupted = true;
    interruption = (async () => {
      // Accepted chunks finish before the backend makes the partial take visible.
      await queue;
      try {
        await bridge.interruptTake(take.id);
      } catch (error) {
        failed = true;
        emit({
          state: "error",
          path: take.path,
          error: `The partial recording backup could not be released: ${message(error)}. Keep the editor open and Save project or Export to preserve this recording. Its backup files have been kept.`,
        });
      }
    })();
    return interruption;
  };

  return {
    path: take.path,
    enqueue(chunk) {
      if (!chunk.size || failed || completion || interrupted) return;
      queue = queue
        .then(async () => {
          if (failed) return;
          for (
            let offset = 0;
            offset < chunk.size;
            offset += TAKE_IPC_CHUNK_BYTES
          ) {
            const bytes = await chunk
              .slice(offset, offset + TAKE_IPC_CHUNK_BYTES)
              .arrayBuffer();
            await bridge.appendTakeChunk(take.id, bytes);
          }
        })
        .catch(fail);
    },
    complete(metadata) {
      if (completion) return completion;
      completion = (async () => {
        await queue;
        if (failed || interrupted) {
          await interrupt();
          return undefined;
        }
        try {
          await bridge.completeTake(take.id, metadata);
          emit({ state: "saved", path: take.path });
          return take.path;
        } catch (error) {
          fail(error);
          await interrupt();
          return undefined;
        }
      })();
      return completion;
    },
    interrupt,
  };
}
