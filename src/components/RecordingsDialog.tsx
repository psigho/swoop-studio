import { FolderOpen, Play, RefreshCw, X } from "lucide-react";
import type { SavedTake } from "../bridge";

export default function RecordingsDialog({
  takes,
  directory,
  busy,
  loading,
  error,
  onOpen,
  onClose,
  onRefresh,
  onShowFolder,
}: {
  takes: SavedTake[];
  directory: string;
  busy: boolean;
  loading: boolean;
  error: string;
  onOpen: (take: SavedTake) => void;
  onClose: () => void;
  onRefresh: () => void;
  onShowFolder: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal recordings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Your recordings"
      >
        <div className="modal-heading">
          <div>
            <h2>Your recordings.</h2>
            <p>
              Original takes, backed up on this device. Open one to keep making.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close recordings"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p className="recordings-note">
          Backups keep the original video and completed cursor track. Save a
          project to keep your edits. Recordings stay here until you remove them
          from their folder.
        </p>
        {error && (
          <p className="recordings-error" role="alert">
            {error}
          </p>
        )}
        <div className="recordings-list" aria-busy={loading || busy}>
          {loading ? (
            <p className="recordings-empty">Looking for your takes…</p>
          ) : takes.length === 0 ? (
            <p className="recordings-empty">
              Your next recording will appear here automatically.
            </p>
          ) : (
            takes.map((take) => (
              <div className="recording-row" key={take.id}>
                <div>
                  <strong>{take.name}</strong>
                  <span>
                    {new Date(take.createdAt).toLocaleString()} ·{" "}
                    {(take.bytes / 1024 / 1024).toFixed(1)} MB
                    {take.duration ? ` · ${take.duration.toFixed(1)}s` : ""}
                  </span>
                  <small>
                    {take.state === "interrupted"
                      ? "Interrupted take · recover the video already written; cursor data may be missing"
                      : take.hasCursorData
                        ? "Original video + cursor track"
                        : "Original video"}
                  </small>
                </div>
                <button
                  className="button secondary"
                  aria-label={`Open recording ${take.name}`}
                  disabled={busy || loading}
                  onClick={() => onOpen(take)}
                >
                  <Play size={15} />
                  Open
                </button>
              </div>
            ))
          )}
        </div>
        <div className="recordings-directory" title={directory}>
          {directory || "Recordings are stored in your Swoop app-data folder."}
        </div>
        <div className="modal-footer">
          <button
            className="button subtle"
            onClick={onShowFolder}
            disabled={busy || !directory}
          >
            <FolderOpen size={15} />
            Show recordings folder
          </button>
          <button
            className="button subtle"
            onClick={onRefresh}
            disabled={busy || loading}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </section>
    </div>
  );
}
