import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Clapperboard,
  Copy,
  Crosshair,
  Download,
  Expand,
  Film,
  FolderOpen,
  Hand,
  HelpCircle,
  Layers,
  Maximize2,
  Mic,
  Minus,
  MousePointer2,
  Move,
  Music2,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  DEMO_DURATION,
  DEMO_POINTERS,
  DEMO_ZOOMS,
  autoZoom,
  exportVideo,
  renderFrame,
  sourcePointAt,
  type PointerSample,
  type StudioSettings,
  type ZoomRegion,
} from "./studio";
import {
  startRecording,
  type NativeSource,
  type RecordingSession,
} from "./recording";
import { parseProject } from "./project";
import type { SavedTake } from "./bridge";
import RecordingsDialog from "./components/RecordingsDialog";
import EffectsPlayground, {
  CursorThumbnail,
} from "./components/EffectsPlayground";

type Tab = "looks" | "frame" | "cursor" | "motion";
type Edit = {
  settings: StudioSettings;
  zooms: ZoomRegion[];
  trimStart: number;
  trimEnd: number;
};
const backgrounds = [
  {
    id: "lagoon",
    name: "Lagoon",
    css: "linear-gradient(130deg,#a0d8c6,#3d778b 50%,#243b64)",
  },
  {
    id: "sunset",
    name: "Afterglow",
    css: "linear-gradient(135deg,#f5c3a5,#d86a57 52%,#6a456f)",
  },
  {
    id: "candy",
    name: "Daydream",
    css: "linear-gradient(135deg,#d6b3ec,#7c87c4 55%,#eab8c4)",
  },
  {
    id: "mesh",
    name: "Electric",
    css: "linear-gradient(140deg,#d1f083,#74aa83 52%,#245c64)",
  },
  {
    id: "cream",
    name: "Paper",
    css: "linear-gradient(140deg,#f7f0de,#d7cbb0)",
  },
  {
    id: "mono",
    name: "Carbon",
    css: "linear-gradient(135deg,#434743,#171c1c)",
  },
] as const;
const aspectRatio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
};
const formatTime = (time: number, precise = false) =>
  `${Math.floor(Math.max(0, time) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, time) % 60)
    .toString()
    .padStart(2, "0")}${
    precise
      ? "." +
        Math.floor((time % 1) * 100)
          .toString()
          .padStart(2, "0")
      : ""
  }`;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const initialEdit = (): Edit => ({
  settings: {
    ...DEFAULT_SETTINGS,
    background: "lagoon",
    cursorColor: "#d7f28b",
  },
  zooms: DEMO_ZOOMS.map((z) => ({ ...z })),
  trimStart: 0,
  trimEnd: DEMO_DURATION,
});

function IconButton({
  label,
  children,
  onClick,
  disabled,
  active,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="control-row slider-row">
      <span>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
    </label>
  );
}
function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function EffectColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-row">
      <span>{label}</span>
      <div>
        {["#d7f28b", "#ffffff", "#ff834d", "#ffd85c", "#9dbeff"].map((c) => (
          <button
            key={c}
            title={c}
            aria-label={`${label} ${c}`}
            className={value === c ? "selected" : ""}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          aria-label={`Custom ${label.toLowerCase()}`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function Miniature({
  settings,
  selected = false,
}: {
  settings: StudioSettings;
  selected?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (c)
      renderFrame(c.getContext("2d")!, {
        width: 256,
        height: 144,
        time: 4.3,
        duration: DEMO_DURATION,
        settings,
        zooms: DEMO_ZOOMS,
        pointers: DEMO_POINTERS,
        isDemo: true,
      });
  }, [settings]);
  return (
    <canvas
      className={selected ? "selected" : ""}
      ref={ref}
      width={256}
      height={144}
      aria-hidden="true"
    />
  );
}

export default function App() {
  const [edit, setEdit] = useState<Edit>(initialEdit);
  const { settings, zooms, trimStart, trimEnd } = edit;
  const [tab, setTab] = useState<Tab>("looks");
  const [cursorPanel, setCursorPanel] = useState<
    "pointer" | "trail" | "click" | "drag"
  >("pointer");
  const [name, setName] = useState("A little everyday magic");
  const [isDemo, setIsDemo] = useState(true);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [sourceBlob, setSourceBlob] = useState<Blob>();
  const [duration, setDuration] = useState(DEMO_DURATION);
  const [pointers, setPointers] = useState<PointerSample[]>(DEMO_POINTERS);
  const [time, setTime] = useState(3.2);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<NativeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [systemAudio, setSystemAudio] = useState(true);
  const [minimizeRecording, setMinimizeRecording] = useState(true);
  const [recording, setRecording] = useState(false);
  const [finishingTake, setFinishingTake] = useState(false);
  const [pausedRecording, setPausedRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState("Rendering your frames");
  const [format, setFormat] = useState<"mp4" | "webm">("webm");
  const [resolution, setResolution] = useState(1080);
  const [appInfo, setAppInfo] = useState<{
    version: string;
    platform: string;
    ffmpeg: boolean;
    clicksSupported: boolean;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [showDemoVideo, setShowDemoVideo] = useState(false);
  const [demoVideoError, setDemoVideoError] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [savedTakes, setSavedTakes] = useState<SavedTake[]>([]);
  const [takesDirectory, setTakesDirectory] = useState("");
  const [takesLoading, setTakesLoading] = useState(false);
  const [recoveringTake, setRecoveringTake] = useState(false);
  const [takesError, setTakesError] = useState("");
  const [backupStatus, setBackupStatus] = useState<{
    state: "saving" | "saved" | "error" | "interrupted";
    path?: string;
    error?: string;
  } | null>(null);
  const [, setHistoryTick] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 800, height: 450 });
  const history = useRef<Edit[]>([]),
    future = useRef<Edit[]>([]);
  const projectRevision = useRef(0),
    saveInProgress = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    video = useRef<HTMLVideoElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const recordSession = useRef<RecordingSession | null>(null),
    abortExport = useRef<AbortController | null>(null);
  const state = useRef({
    time,
    playing,
    edit,
    duration,
    isDemo,
    pointers,
    exporting,
    recoveringTake,
  });
  state.current = {
    time,
    playing,
    edit,
    duration,
    isDemo,
    pointers,
    exporting,
    recoveringTake,
  };
  const selectedZoom = zooms.find((z) => z.id === selected);
  const native = !!window.swoop;
  const selectedNativeSource = sources.find((s) => s.id === selectedSource);
  const capturingSelf =
    !!selectedNativeSource?.isSelf ||
    selectedNativeSource?.name === document.title;

  const notify = (message: string) => setToast(message);
  function updateEdit(
    change: Partial<Edit> | ((value: Edit) => Edit),
    remember = true,
  ) {
    const current = state.current.edit;
    if (remember) {
      history.current = [
        ...history.current.slice(-59),
        structuredClone(current),
      ];
      future.current = [];
      setHistoryTick((t) => t + 1);
    }
    const next =
      typeof change === "function"
        ? change(current)
        : { ...current, ...change };
    state.current.edit = next;
    projectRevision.current++;
    setEdit(next);
    setDirty(true);
  }
  function setSetting<K extends keyof StudioSettings>(
    key: K,
    value: StudioSettings[K],
  ) {
    updateEdit((e) => ({ ...e, settings: { ...e.settings, [key]: value } }));
  }
  function undo() {
    const item = history.current.pop();
    if (item) {
      projectRevision.current++;
      future.current.push(structuredClone(edit));
      setEdit(item);
      setDirty(true);
      setHistoryTick((t) => t + 1);
    }
  }
  function redo() {
    const item = future.current.pop();
    if (item) {
      projectRevision.current++;
      history.current.push(structuredClone(edit));
      setEdit(item);
      setDirty(true);
      setHistoryTick((t) => t + 1);
    }
  }
  function patchZoom(id: string, change: Partial<ZoomRegion>) {
    updateEdit((e) => ({
      ...e,
      zooms: e.zooms.map((z) => (z.id === id ? { ...z, ...change } : z)),
    }));
  }
  function seek(t: number) {
    const next = clamp(t, trimStart, trimEnd);
    state.current.time = next;
    setTime(next);
    if (
      video.current &&
      sourceUrl &&
      Math.abs(video.current.currentTime - next) > 0.03
    )
      video.current.currentTime = next;
  }
  function togglePlay() {
    if (exporting || recording || finishingTake) return;
    const current = state.current;
    const at = current.isDemo
      ? current.time
      : (video.current?.currentTime ?? current.time);
    if (
      !current.playing &&
      (at >= current.edit.trimEnd - 0.04 ||
        current.time >= current.edit.trimEnd - 0.04)
    )
      seek(current.edit.trimStart);
    state.current.playing = !current.playing;
    setPlaying(state.current.playing);
  }

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      setStageSize({
        width: Math.max(
          20,
          box.width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
        ),
        height: Math.max(
          20,
          box.height -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
        ),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (time < trimStart || time > trimEnd)
      seek(clamp(time, trimStart, trimEnd));
  }, [trimStart, trimEnd]);
  useEffect(() => {
    if (
      !showSources &&
      !showExport &&
      !help &&
      !showDemoVideo &&
      !showRecordings
    )
      return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const prior = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled),video[controls],[tabindex="0"]:not(:disabled)',
        ),
      ].filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      document.removeEventListener("keydown", trap, true);
      prior?.focus();
    };
  }, [showSources, showExport, help, showDemoVideo, showRecordings]);
  useEffect(
    () =>
      window.swoop?.onExportProgress((progress) => {
        if (progress.stage === "encoding") {
          setExportPhase("Converting to MP4");
          setExportProgress(progress.ratio ?? 0);
        } else if (progress.stage === "complete") setExportProgress(1);
      }),
    [],
  );
  useEffect(() => {
    window.swoop
      ?.getAppInfo()
      .then((info) => {
        setAppInfo(info);
        if (info.ffmpeg) setFormat("mp4");
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    window.swoop
      ?.listTakes()
      .then((result) => {
        if (!active) return;
        setSavedTakes(result.takes);
        setTakesDirectory(result.directory);
        if (result.takes.length && !recordSession.current)
          setShowRecordings(true);
      })
      .catch((e: unknown) => {
        if (active)
          setTakesError(
            `Could not read recording backups. ${(e as Error).message}`,
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty && !savingProject && !exporting && !recording && !finishingTake)
      return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, savingProject, exporting, recording, finishingTake]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    if (playing) {
      v.play().catch(() => setPlaying(false));
    } else v.pause();
  }, [playing, sourceUrl, muted]);
  useEffect(() => {
    let raf = 0,
      last = performance.now(),
      lastUI = 0;
    const draw = (now: number) => {
      const s = state.current,
        c = canvas.current;
      let t = s.time;
      if (s.playing) {
        t = s.isDemo
          ? t + (now - last) / 1000
          : (video.current?.currentTime ?? t);
        if (t >= s.edit.trimEnd) {
          t = s.edit.trimEnd;
          state.current.playing = false;
          setTime(t);
          setPlaying(false);
          video.current?.pause();
        }
        state.current.time = t;
        if (now - lastUI > 35) {
          setTime(t);
          lastUI = now;
        }
      }
      last = now;
      if (c) {
        const ratio = aspectRatio(s.edit.settings.aspect);
        const w = 1280,
          h = Math.round(w / ratio);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        renderFrame(c.getContext("2d")!, {
          width: w,
          height: h,
          time: t,
          duration: s.duration,
          settings: s.edit.settings,
          zooms: s.edit.zooms,
          pointers: s.pointers,
          video: video.current ?? undefined,
          isDemo: s.isDemo,
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function loadMedia(
    blob: Blob,
    title: string,
    knownDuration?: number,
    newPointers: PointerSample[] = [],
  ) {
    setPlaying(false);
    const url = URL.createObjectURL(blob);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          probe.onloadedmetadata = null;
          probe.onerror = null;
          reject(
            new Error(
              "The video did not become readable. The original file or backup has not been changed.",
            ),
          );
        }, 20000);
        probe.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        probe.onerror = () => {
          clearTimeout(timeout);
          reject(
            new Error(
              "That video could not be opened. Try an MP4 or WebM file.",
            ),
          );
        };
      });
      let len = knownDuration ?? probe.duration;
      if (!Number.isFinite(len) || len <= 0) {
        probe.currentTime = 1e10;
        await new Promise<void>((resolve) => {
          probe.ontimeupdate = () => resolve();
          setTimeout(resolve, 1500);
        });
        len = probe.duration;
      }
      if (!Number.isFinite(len) || len <= 0)
        throw new Error(
          "The clip has no readable duration. Try converting it to MP4 first.",
        );
      projectRevision.current++;
      setBackupStatus(null);
      setSourceBlob(blob);
      setSourceUrl(url);
      setIsDemo(false);
      setName(title.replace(/\.[^.]+$/, ""));
      setDuration(len);
      setPointers(newPointers);
      setTime(0);
      setSelected(null);
      history.current = [];
      future.current = [];
      setEdit((e) => ({
        ...e,
        trimStart: 0,
        trimEnd: len,
        zooms: autoZoom(newPointers, len),
      }));
      setDirty(true);
      notify("Your clip is ready. Make it move.");
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    } finally {
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.ontimeupdate = null;
      probe.removeAttribute("src");
      probe.load();
    }
  }
  async function importFile(file?: File) {
    if (!file || recording || finishingTake || exporting) return;
    if (
      dirty &&
      !window.confirm(
        "Replace the current edit? Save your project first if you want to keep it.",
      )
    )
      return;
    try {
      await loadMedia(file, file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function showRecorder() {
    if (recording || finishingTake || exporting) return;
    if (
      dirty &&
      !window.confirm(
        "Start a new take and replace this edit? Save your project first if you want to keep it.",
      )
    )
      return;
    setPlaying(false);
    setShowSources(true);
    if (!native) return;
    setSourcesLoading(true);
    try {
      const items = await window.swoop!.getSources();
      setSources(items);
      setSelectedSource(items[0]?.id ?? "");
    } catch (e) {
      setError(`Could not list screens: ${(e as Error).message}`);
    } finally {
      setSourcesLoading(false);
    }
  }
  async function beginRecord() {
    setShowSources(false);
    setError("");
    setBackupStatus(null);
    setCountdown(3);
    try {
      for (let n = 3; n > 0; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 750));
      }
      const session = await startRecording({
        sourceId: native ? selectedSource : undefined,
        microphone,
        systemAudio,
        onElapsed: setRecordTime,
        onBackupStatus: (status) => {
          setBackupStatus(status);
          if (status.state === "error")
            setError(
              status.error ||
                "Automatic backup failed. Keep the studio open and save or export this take.",
            );
        },
        onEnded: () => {
          if (recordSession.current) void stopRecord();
        },
      });
      recordSession.current = session;
      setRecording(true);
      setPausedRecording(false);
      setRecordTime(0);
      if (minimizeRecording && native && !capturingSelf)
        window.swoop!.minimize();
    } catch (e) {
      setError(`Recording could not start. ${(e as Error).message}`);
    } finally {
      setCountdown(null);
    }
  }
  async function stopRecord() {
    const session = recordSession.current;
    if (!session) return;
    recordSession.current = null;
    setRecording(false);
    setFinishingTake(true);
    setPausedRecording(false);
    try {
      const result = await session.stop();
      await loadMedia(
        result.blob,
        `Take ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}`,
        result.duration,
        result.pointers,
      );
      if (result.backupPath) {
        setBackupStatus({ state: "saved", path: result.backupPath });
        notify(`Recording backed up · ${result.backupPath}`);
      } else if (native)
        setBackupStatus({
          state: "error",
          error:
            "Automatic backup is incomplete. Save or export this take before closing.",
        });
      if (result.warnings.length) notify(result.warnings.join(" "));
    } catch (e) {
      setError(`Could not finish this take. ${(e as Error).message}`);
    } finally {
      setFinishingTake(false);
    }
  }
  function pauseRecord() {
    const session = recordSession.current;
    if (!session) return;
    if (pausedRecording) session.resume();
    else session.pause();
    setPausedRecording((p) => !p);
  }
  function addZoom() {
    const start = clamp(time, 0, Math.max(0, duration - 0.3));
    const id = crypto.randomUUID();
    updateEdit((e) => ({
      ...e,
      zooms: [
        ...e.zooms,
        {
          id,
          start,
          end: Math.min(duration, start + 2.5),
          x: 0.5,
          y: 0.5,
          scale: 1.65,
        },
      ].sort((a, b) => a.start - b.start),
    }));
    setSelected(id);
    setTab("motion");
    notify("Zoom added. Click the preview to set its focus.");
  }
  function removeZoom() {
    if (!selected) return;
    updateEdit((e) => ({
      ...e,
      zooms: e.zooms.filter((z) => z.id !== selected),
    }));
    setSelected(null);
  }
  function applyPreset(id: string) {
    const presets: Record<string, Partial<StudioSettings>> = {
      flow: {
        background: "lagoon",
        motion: "smooth",
        intro: "rise",
        cursorStyle: "arrow",
        cursorColor: "#d7f28b",
        cursorTrail: false,
      },
      punch: {
        background: "sunset",
        motion: "snappy",
        intro: "pop",
        cursorStyle: "dot",
        cursorColor: "#fff6df",
        cursorTrail: true,
      },
      float: {
        background: "candy",
        motion: "float",
        intro: "swoop",
        cursorStyle: "ring",
        cursorColor: "#ffffff",
        cursorTrail: true,
      },
      focus: {
        background: "mono",
        motion: "smooth",
        intro: "none",
        cursorStyle: "crosshair",
        cursorColor: "#d7f28b",
        cursorTrail: false,
      },
    };
    updateEdit((e) => ({ ...e, settings: { ...e.settings, ...presets[id] } }));
    seek(trimStart);
    setPlaying(true);
    notify(
      `${{ flow: "Flow", punch: "Punch", float: "Daydream", focus: "Focus" }[id]} look applied`,
    );
  }
  function resetDemo() {
    if (recording || finishingTake || exporting) return;
    if (
      dirty &&
      !window.confirm(
        "Load the playground and replace this edit? Save your project first to keep your work.",
      )
    )
      return;
    projectRevision.current++;
    setPlaying(false);
    setBackupStatus(null);
    setSourceBlob(undefined);
    setSourceUrl(undefined);
    setIsDemo(true);
    setDuration(DEMO_DURATION);
    setPointers(DEMO_POINTERS);
    setTime(3.2);
    setEdit(initialEdit());
    setName("A little everyday magic");
    setSelected(null);
    setDirty(false);
    history.current = [];
    future.current = [];
  }

  async function saveProject() {
    if (saveInProgress.current || recording || finishingTake) return;
    saveInProgress.current = true;
    setSavingProject(true);
    // Capture one coherent project before reading media or awaiting a file dialog.
    // Edits can continue while that snapshot saves, but must remain unsaved.
    const revision = projectRevision.current;
    const snapshot = {
      schemaVersion: 1,
      name: name.trim() || "Untitled take",
      isDemo,
      duration,
      pointers,
      ...structuredClone(edit),
    };
    const media = sourceBlob;
    try {
      if (media && media.size > 180 * 1024 * 1024)
        throw new Error(
          "This recording is too large for an embedded project (180 MB limit). Export the finished clip first; your recording stays open here.",
        );
      const mediaBase64 = media
        ? await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve((r.result as string).split(",")[1]);
            r.onerror = () => reject(new Error("Could not read recording"));
            r.readAsDataURL(media);
          })
        : undefined;
      const data = {
        ...snapshot,
        mediaBase64,
        mediaType: media?.type,
      };
      if (native) {
        const result = await window.swoop!.saveProject(data);
        if (result.error) throw new Error(result.error);
        if (result.canceled) return;
        notify(`Project saved${result.path ? " · " + result.path : ""}`);
      } else
        downloadBlob(
          new Blob([JSON.stringify(data)], { type: "application/json" }),
          `${snapshot.name}.swoop`,
        );
      if (projectRevision.current === revision) {
        setName(snapshot.name);
        setDirty(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveInProgress.current = false;
      setSavingProject(false);
    }
  }
  async function restoreProject(data: unknown) {
    try {
      const p = parseProject(data);
      const safeSettings = p.settings,
        safeZooms = p.zooms,
        safePointers = p.pointers;
      if (!p.isDemo) {
        if (typeof p.mediaBase64 !== "string")
          throw new Error("This project has no embedded recording.");
        const bytes = Uint8Array.from(atob(p.mediaBase64), (c) =>
          c.charCodeAt(0),
        );
        await loadMedia(
          new Blob([bytes], {
            type: typeof p.mediaType === "string" ? p.mediaType : "video/webm",
          }),
          p.name,
          Number(p.duration),
          safePointers,
        );
      } else {
        setSourceBlob(undefined);
        setSourceUrl(undefined);
        setIsDemo(true);
        setDuration(Number(p.duration));
        setPointers(safePointers);
      }
      const start = p.trimStart,
        end = p.trimEnd;
      projectRevision.current++;
      setPlaying(false);
      setName(p.name);
      setEdit({
        settings: safeSettings,
        zooms: safeZooms,
        trimStart: start,
        trimEnd: end,
      });
      setTime(start);
      if (video.current) video.current.currentTime = start;
      setSelected(null);
      setDirty(false);
      history.current = [];
      future.current = [];
      notify("Project opened. Pick up where you left off.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openProject() {
    if (recording || finishingTake || exporting) return;
    if (
      dirty &&
      !window.confirm(
        "Open another project and replace this edit? Save first if you want to keep it.",
      )
    )
      return;
    if (native) {
      try {
        const result = await window.swoop!.openProject();
        if (result.error) throw new Error(result.error);
        if (!result.canceled) await restoreProject(result.data);
      } catch (e) {
        setError((e as Error).message);
      }
    } else projectInput.current?.click();
  }
  async function refreshTakes() {
    if (!window.swoop) return;
    setTakesLoading(true);
    setTakesError("");
    try {
      const result = await window.swoop.listTakes();
      setSavedTakes(result.takes);
      setTakesDirectory(result.directory);
    } catch (e) {
      setTakesError((e as Error).message);
    } finally {
      setTakesLoading(false);
    }
  }
  function openRecordings() {
    if (recording || finishingTake || exporting) return;
    setPlaying(false);
    setShowRecordings(true);
    void refreshTakes();
  }
  async function recoverTake(take: SavedTake) {
    if (!window.swoop || recoveringTake) return;
    if (
      dirty &&
      !window.confirm(
        "Open this recording and replace the current edit? Save your project first to keep your edits.",
      )
    )
      return;
    setRecoveringTake(true);
    setTakesError("");
    try {
      const result = await window.swoop.openTake(take.id);
      // Copy the IPC view so Blob owns a normal ArrayBuffer even across realms.
      const data = new Uint8Array(result.bytes);
      await loadMedia(
        new Blob([data], { type: result.mimeType }),
        result.take.name,
        result.take.duration,
        result.pointers,
      );
      setName(result.take.name);
      setBackupStatus({
        state: result.take.state === "interrupted" ? "interrupted" : "saved",
        path: result.take.path,
      });
      setShowRecordings(false);
      notify(
        result.take.state === "interrupted"
          ? "Recovered the video saved before interruption. Check its ending before export."
          : "Recording reopened. Your original backup stays safe.",
      );
    } catch (e) {
      setTakesError((e as Error).message);
    } finally {
      setRecoveringTake(false);
    }
  }
  async function showTakesFolder() {
    try {
      await window.swoop?.showTakesFolder();
    } catch (e) {
      setTakesError((e as Error).message);
    }
  }
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function doExport() {
    setPlaying(false);
    setExporting(true);
    setExportProgress(0);
    setExportPhase("Rendering your frames");
    const controller = new AbortController();
    abortExport.current = controller;
    try {
      const ratio = aspectRatio(settings.aspect);
      const width =
        ratio >= 1 ? Math.round((resolution * ratio) / 2) * 2 : resolution; // resolution is short-edge pixels
      const blob = await exportVideo({
        sourceUrl,
        isDemo,
        duration,
        trimStart,
        trimEnd,
        settings,
        zooms,
        pointers,
        width,
        fps: 30,
        onProgress: setExportProgress,
        signal: controller.signal,
      });
      if (native) {
        setExportPhase(
          format === "mp4" ? "Converting to MP4" : "Saving your video",
        );
        setExportProgress(1);
        const result = await window.swoop!.saveVideo({
          bytes: await blob.arrayBuffer(),
          name,
          format,
        });
        if (result.error) throw new Error(result.error);
        if (result.canceled) {
          notify("Export rendered; save was canceled.");
          return;
        }
        notify(`Video saved · ${result.path}`);
      } else {
        downloadBlob(blob, `${name}.webm`);
        notify("Your video is ready. Check your downloads.");
      }
      setShowExport(false);
    } catch (e) {
      if ((e as Error).name === "AbortError")
        notify("Export canceled. Your edit is still here.");
      else setError(`Export failed. ${(e as Error).message}`);
    } finally {
      setExporting(false);
      abortExport.current = null;
    }
  }
  const actions = useRef({
    togglePlay,
    seek,
    saveProject,
    openProject,
    undo,
    redo,
    addZoom,
    removeZoom,
    stopRecord,
  });
  actions.current = {
    togglePlay,
    seek,
    saveProject,
    openProject,
    undo,
    redo,
    addZoom,
    removeZoom,
    stopRecord,
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (recordSession.current) void actions.current.stopRecord();
        else {
          setShowSources(false);
          if (!state.current.exporting) setShowExport(false);
          setHelp(false);
          setShowDemoVideo(false);
          if (!state.current.recoveringTake) setShowRecordings(false);
          setSelected(null);
        }
        return;
      }
      if (
        document.querySelector("[role=dialog]") ||
        (e.target as HTMLElement)?.matches(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          void actions.current.saveProject();
        }
        if (e.key === "o") {
          e.preventDefault();
          void actions.current.openProject();
        }
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) actions.current.redo();
          else actions.current.undo();
        }
        if (e.key === "e") {
          e.preventDefault();
          setShowExport(true);
        }
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        actions.current.togglePlay();
      }
      if (e.key === "ArrowLeft")
        actions.current.seek(state.current.time - (e.shiftKey ? 1 : 1 / 30));
      if (e.key === "ArrowRight")
        actions.current.seek(state.current.time + (e.shiftKey ? 1 : 1 / 30));
      if (
        e.key === "i" &&
        state.current.time < state.current.edit.trimEnd - 0.2
      )
        updateEdit({ trimStart: state.current.time });
      if (
        e.key === "o" &&
        state.current.time > state.current.edit.trimStart + 0.2
      )
        updateEdit({ trimEnd: state.current.time });
      if (e.key === "z") actions.current.addZoom();
      if (e.key === "Delete" || e.key === "Backspace")
        actions.current.removeZoom();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function scrub(e: React.PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest(".zoom-region")) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const at = (x: number) => seek(((x - rect.left) / rect.width) * duration);
    at(e.clientX);
    el.setPointerCapture(e.pointerId);
    const move = (event: PointerEvent) => at(event.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  function dragZoom(
    e: React.PointerEvent,
    zoom: ZoomRegion,
    edge?: "start" | "end",
  ) {
    e.stopPropagation();
    e.preventDefault();
    setSelected(zoom.id);
    setTab("motion");
    const el = e.currentTarget as HTMLElement;
    const track = el.closest(".zoom-track")!;
    const width = track.getBoundingClientRect().width;
    const origin = e.clientX;
    const base = structuredClone(edit);
    history.current.push(base);
    future.current = [];
    setHistoryTick((t) => t + 1);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - origin) / width) * duration;
      let change: Partial<ZoomRegion> = {};
      if (edge === "start")
        change = { start: clamp(zoom.start + delta, 0, zoom.end - 0.2) };
      else if (edge === "end")
        change = { end: clamp(zoom.end + delta, zoom.start + 0.2, duration) };
      else {
        const start = clamp(
          zoom.start + delta,
          0,
          duration - (zoom.end - zoom.start),
        );
        change = { start, end: start + zoom.end - zoom.start };
      }
      setEdit({
        ...base,
        zooms: base.zooms.map((z) =>
          z.id === zoom.id ? { ...z, ...change } : z,
        ),
      });
      projectRevision.current++;
      setDirty(true);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  function focusZoom(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!selectedZoom) return;
    const c = e.currentTarget,
      r = c.getBoundingClientRect();
    const point = sourcePointAt(
      ((e.clientX - r.left) / r.width) * c.width,
      ((e.clientY - r.top) / r.height) * c.height,
      {
        width: c.width,
        height: c.height,
        time,
        duration,
        settings,
        zooms,
        pointers,
        video: video.current ?? undefined,
        isDemo,
      },
    );
    if (point) patchZoom(selectedZoom.id, point);
  }

  return (
    <div className={`app-shell tab-${tab}`}>
      <header className="topbar">
        <div className="brand" title="Swoop Studio">
          <span className="brand-mark">
            <MousePointer2 size={20} strokeWidth={2.6} />
            <i />
          </span>
          <strong>
            swoop<span>studio</span>
          </strong>
        </div>
        <div className="project-heading">
          <input
            aria-label="Project name"
            value={name}
            maxLength={80}
            onChange={(e) => {
              projectRevision.current++;
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <span
            className={`save-state ${dirty ? "unsaved" : ""}`}
            title={dirty ? "Unsaved changes" : "Project ready"}
          >
            {dirty ? (
              <Circle size={5} fill="currentColor" />
            ) : (
              <Check size={11} />
            )}
            <span>{dirty ? "Unsaved" : "Ready to play"}</span>
          </span>
        </div>
        <div className="file-actions">
          {native && (
            <IconButton
              label="Recordings"
              disabled={recording || finishingTake || exporting}
              onClick={openRecordings}
            >
              <Film size={17} />
            </IconButton>
          )}
          <IconButton
            label="Open project · Ctrl+O"
            disabled={recording || finishingTake || exporting}
            onClick={() => void openProject()}
          >
            <FolderOpen size={17} />
          </IconButton>
          <IconButton
            label="Save project · Ctrl+S"
            disabled={savingProject || recording || finishingTake}
            onClick={() => void saveProject()}
          >
            <Save size={17} />
          </IconButton>
        </div>
        {backupStatus && (recording || !isDemo) && (
          <span
            className={`take-backup-state ${backupStatus.state}`}
            role="status"
            title={backupStatus.error || backupStatus.path}
          >
            {backupStatus.state === "error"
              ? "Backup incomplete"
              : backupStatus.state === "interrupted"
                ? "Recovered partial take"
                : backupStatus.state === "saved"
                  ? "Original backed up"
                  : "Backing up take"}
          </span>
        )}
        <div className="header-actions">
          <button
            className="button subtle"
            onClick={() => fileInput.current?.click()}
            disabled={recording || finishingTake || exporting}
          >
            <Upload size={15} />
            Import video
          </button>
          <button
            className="button record-button"
            onClick={() => void showRecorder()}
            disabled={recording || finishingTake || exporting}
          >
            <Circle size={12} fill="currentColor" />
            Record
          </button>
          <button
            className="button primary export-button"
            onClick={() => setShowExport(true)}
            disabled={recording || finishingTake || exporting}
          >
            <ArrowUpRight size={17} />
            Export
            <ChevronDown size={13} />
          </button>
        </div>
        {native && (
          <div className="window-actions">
            <button
              aria-label="Minimize"
              onClick={() => window.swoop!.minimize()}
            >
              <Minus size={13} />
            </button>
            <button
              aria-label="Maximize"
              onClick={() => window.swoop!.maximize()}
            >
              <Square size={10} />
            </button>
            <button
              aria-label="Close studio"
              onClick={() => window.swoop!.close()}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </header>
      <nav className="tool-rail" aria-label="Studio tools">
        {(
          [
            { id: "looks", icon: Sparkles, label: "Looks" },
            { id: "frame", icon: Layers, label: "Frame" },
            { id: "cursor", icon: MousePointer2, label: "Cursor" },
            { id: "motion", icon: WandSparkles, label: "Motion" },
          ] as const
        ).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
            title={label}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <button
          onClick={() => setHelp(true)}
          title="Help and keyboard shortcuts"
        >
          <HelpCircle size={20} />
          <span>Help</span>
        </button>
        <span className="rail-footer">S.</span>
      </nav>
      <aside className="library">
        <div className="panel-heading">
          <h2>Make it yours.</h2>
          <Sparkles size={15} />
        </div>
        <p className="panel-description">A good take. A little personality.</p>
        <div className="library-label">
          STUDIO LOOKS<span>4</span>
        </div>
        <div className="preset-list">
          {[
            {
              id: "flow",
              title: "Flow",
              sub: "Soft focus. Smooth moves.",
              background: "lagoon",
              motion: "smooth",
            },
            {
              id: "punch",
              title: "Punch",
              sub: "Big energy. Quick cuts.",
              background: "sunset",
              motion: "snappy",
            },
            {
              id: "float",
              title: "Daydream",
              sub: "Drift into the details.",
              background: "candy",
              motion: "float",
            },
            {
              id: "focus",
              title: "Focus",
              sub: "Just you and the idea.",
              background: "mono",
              motion: "smooth",
            },
          ].map((p) => (
            <button
              key={p.id}
              className={`preset ${settings.background === p.background && settings.motion === p.motion ? "current" : ""}`}
              onClick={() => applyPreset(p.id)}
            >
              <div className="preset-image">
                <Miniature
                  settings={{
                    ...settings,
                    background: p.background as StudioSettings["background"],
                    motion: p.motion as StudioSettings["motion"],
                  }}
                />
                {settings.background === p.background &&
                  settings.motion === p.motion && (
                    <span className="preset-check">
                      <Check size={11} />
                    </span>
                  )}
              </div>
              <span className="preset-title">
                {p.title}
                <ArrowUpRight size={12} />
              </span>
              <small>{p.sub}</small>
            </button>
          ))}
        </div>
        <div className="library-bottom">
          <div className="local-dot" />
          <span>Made here. Stays here.</span>
          <small>No upload. No waiting room.</small>
        </div>
      </aside>
      <main className="workbench">
        <div className="stage-toolbar">
          <div>
            <span className="clip-dot" />
            <span>{isDemo ? "The playground" : name}</span>
            {isDemo && <span className="tiny-badge">DEMO</span>}
          </div>
          <div>
            <button
              className="aspect-button"
              title="Cycle aspect ratio"
              onClick={() => {
                const a = ["16:9", "9:16", "1:1", "4:3"] as const;
                setSetting(
                  "aspect",
                  a[(a.indexOf(settings.aspect) + 1) % a.length],
                );
              }}
            >
              <Expand size={13} />
              {settings.aspect}
              <ChevronDown size={11} />
            </button>
            <IconButton
              label="View preview fullscreen"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void stage.current?.requestFullscreen();
              }}
            >
              <Maximize2 size={14} />
            </IconButton>
          </div>
        </div>
        <div className="stage" ref={stage}>
          <div
            className="canvas-fit"
            style={{
              width: Math.min(
                stageSize.width,
                stageSize.height * aspectRatio(settings.aspect),
              ),
              height: Math.min(
                stageSize.height,
                stageSize.width / aspectRatio(settings.aspect),
              ),
            }}
          >
            <canvas
              ref={canvas}
              onClick={focusZoom}
              aria-label="Video preview"
              style={{ cursor: selectedZoom ? "crosshair" : "default" }}
            />
          </div>
          {selectedZoom && (
            <span className="focus-hint">
              <Crosshair size={12} />
              Click the video to move zoom focus
            </span>
          )}
        </div>
        <div className="transport">
          <div className="transport-left">
            <span className="preview-label">
              <span />
              LIVE PREVIEW
            </span>
            <span className="timecode">
              {formatTime(time, true)}
              <span>/ {formatTime(duration, true)}</span>
            </span>
          </div>
          <div className="playback-buttons">
            <IconButton label="Go to start" onClick={() => seek(trimStart)}>
              <SkipBack size={15} />
            </IconButton>
            <button
              className="play-button"
              title="Play / Pause · Space"
              aria-label={playing ? "Pause preview" : "Play preview"}
              onClick={togglePlay}
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <IconButton label="Go to end" onClick={() => seek(trimEnd)}>
              <SkipForward size={15} />
            </IconButton>
          </div>
          <div className="transport-right">
            <span>30 fps</span>
            <IconButton
              label={muted ? "Unmute preview" : "Mute preview"}
              onClick={() => setMuted((v) => !v)}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </IconButton>
          </div>
        </div>
        <section className="timeline" aria-label="Editing timeline">
          <div className="timeline-toolbar">
            <div>
              <IconButton
                label="Undo · Ctrl+Z"
                disabled={!history.current.length}
                onClick={undo}
              >
                <Undo2 size={15} />
              </IconButton>
              <IconButton
                label="Redo · Ctrl+Shift+Z"
                disabled={!future.current.length}
                onClick={redo}
              >
                <Redo2 size={15} />
              </IconButton>
              <span className="toolbar-separator" />
              <button className="text-tool" onClick={addZoom}>
                <Plus size={13} />
                Add zoom
              </button>
              <button
                className="text-tool auto-zoom"
                onClick={() => {
                  if (!pointers.some((p) => p.click)) {
                    notify(
                      "Add manual zooms for imported video. Automatic zooms use recorded clicks.",
                    );
                    return;
                  }
                  updateEdit({ zooms: autoZoom(pointers, duration) });
                  notify("Zooms built from your clicks.");
                }}
              >
                <WandSparkles size={13} />
                Auto zoom
              </button>
            </div>
            <div>
              <span className="timeline-length">
                {formatTime(trimEnd - trimStart, true)} selected
              </span>
              <IconButton
                label="Trim start to playhead · I"
                onClick={() => {
                  if (time < trimEnd - 0.2) updateEdit({ trimStart: time });
                }}
              >
                <Scissors size={14} />
              </IconButton>
            </div>
          </div>
          <div className="timeline-body">
            <div className="track-labels">
              <div>TIME</div>
              <div>
                <Film size={13} />
                Video
              </div>
              <div>
                <ZoomIn size={13} />
                Zooms<span>{zooms.length}</span>
              </div>
            </div>
            <div className="tracks">
              <div className="ruler" onPointerDown={scrub}>
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} style={{ left: `${(i / 8) * 100}%` }}>
                    {formatTime((duration * i) / 8)}
                  </span>
                ))}
              </div>
              <div className="video-track" onPointerDown={scrub}>
                <div
                  className="trim-dim start"
                  style={{ width: `${(trimStart / duration) * 100}%` }}
                />
                <div
                  className="trim-dim end"
                  style={{
                    width: `${((duration - trimEnd) / duration) * 100}%`,
                  }}
                />
                <div className="filmstrip">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className="film-frame">
                      {isDemo ? (
                        <Miniature settings={settings} />
                      ) : (
                        <div className="clip-strip">
                          <Video size={20} />
                          <span>{name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <span className="clip-name">
                  <Video size={11} />
                  {isDemo ? "Your next great demo.webm" : `${name}.webm`}
                </span>
              </div>
              <div className="zoom-track" onPointerDown={scrub}>
                {zooms.map((z, i) => (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Zoom ${i + 1}: ${z.start.toFixed(1)} to ${z.end.toFixed(1)} seconds`}
                    key={z.id}
                    className={`zoom-region ${selected === z.id ? "selected" : ""}`}
                    style={{
                      left: `${(z.start / duration) * 100}%`,
                      width: `${((z.end - z.start) / duration) * 100}%`,
                    }}
                    onPointerDown={(e) => dragZoom(e, z)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelected(z.id);
                        setTab("motion");
                        seek(z.start);
                      }
                    }}
                  >
                    <span
                      className="resize-handle left"
                      onPointerDown={(e) => dragZoom(e, z, "start")}
                    />
                    <ZoomIn size={11} />
                    <span>{z.scale.toFixed(1)}×</span>
                    <span className="zoom-line" />
                    <span
                      className="resize-handle right"
                      onPointerDown={(e) => dragZoom(e, z, "end")}
                    />
                  </div>
                ))}
              </div>
              <div
                className="playhead"
                style={{ left: `${(time / duration) * 100}%` }}
              >
                <span />
                <i />
              </div>
            </div>
          </div>
          <div className="timeline-footer">
            <span>
              <MousePointer2 size={11} />
              {pointers.length
                ? `${pointers.length.toLocaleString()} cursor samples`
                : "No cursor track · add zooms manually"}
            </span>
            <div className="trim-values">
              <label>
                In
                <input
                  aria-label="Trim in seconds"
                  type="number"
                  min={0}
                  max={trimEnd - 0.1}
                  step={0.1}
                  value={Number(trimStart.toFixed(2))}
                  onChange={(e) =>
                    updateEdit({
                      trimStart: clamp(
                        Number(e.target.value),
                        0,
                        trimEnd - 0.1,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Out
                <input
                  aria-label="Trim out seconds"
                  type="number"
                  min={trimStart + 0.1}
                  max={duration}
                  step={0.1}
                  value={Number(trimEnd.toFixed(2))}
                  onChange={(e) =>
                    updateEdit({
                      trimEnd: clamp(
                        Number(e.target.value),
                        trimStart + 0.1,
                        duration,
                      ),
                    })
                  }
                />
              </label>
            </div>
          </div>
        </section>
      </main>
      <aside className="inspector">
        <div className="inspector-top">
          <h2>
            {
              {
                looks: "The finishing touches",
                frame: "Set the scene",
                cursor: "Follow your lead",
                motion: "Make your move",
              }[tab]
            }
          </h2>
          <Settings2 size={15} />
        </div>
        <div className="inspector-tabs">
          {(["frame", "cursor", "motion"] as const).map((t) => (
            <button
              key={t}
              className={
                (tab === "looks" ? "frame" : tab) === t ? "selected" : ""
              }
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="inspector-scroll">
          {(tab === "looks" || tab === "frame") && (
            <>
              <section className="control-section">
                <h3>
                  Background<span>Let the idea stand out.</span>
                </h3>
                <div className="background-grid">
                  {backgrounds.map((b) => (
                    <button
                      title={b.name}
                      aria-label={`${b.name} background`}
                      aria-pressed={settings.background === b.id}
                      key={b.id}
                      className={`background-swatch ${settings.background === b.id ? "selected" : ""}`}
                      style={{ background: b.css }}
                      onClick={() => setSetting("background", b.id)}
                    >
                      {settings.background === b.id && <Check size={16} />}
                      <span>{b.name}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="control-section">
                <h3>Composition</h3>
                <div className="segmented aspects">
                  {(["16:9", "9:16", "1:1", "4:3"] as const).map((a) => (
                    <button
                      className={settings.aspect === a ? "selected" : ""}
                      key={a}
                      onClick={() => setSetting("aspect", a)}
                    >
                      <span
                        className="ratio-icon"
                        style={{ aspectRatio: aspectRatio(a) }}
                      />
                      {a}
                    </button>
                  ))}
                </div>
                <Slider
                  label="Breathing room"
                  value={settings.padding}
                  max={100}
                  suffix=" px"
                  onChange={(v) => setSetting("padding", v)}
                />
                <Slider
                  label="Corner radius"
                  value={settings.roundness}
                  max={50}
                  suffix=" px"
                  onChange={(v) => setSetting("roundness", v)}
                />
                <Slider
                  label="Shadow"
                  value={settings.shadow}
                  suffix="%"
                  onChange={(v) => setSetting("shadow", v)}
                />
              </section>
              <section className="control-section">
                <h3>Window frame</h3>
                <div className="segmented">
                  {(["none", "mac", "browser"] as const).map((v) => (
                    <button
                      key={v}
                      className={settings.cameraFrame === v ? "selected" : ""}
                      onClick={() => setSetting("cameraFrame", v)}
                    >
                      {v === "mac"
                        ? "Minimal"
                        : v === "browser"
                          ? "Browser"
                          : "Clean"}
                    </button>
                  ))}
                </div>
                <Toggle
                  label="A little texture"
                  description="Fine grain, less digital."
                  value={settings.grain}
                  onChange={(v) => setSetting("grain", v)}
                />
              </section>
            </>
          )}
          {tab === "cursor" && (
            <>
              <div
                className="cursor-section-nav"
                role="tablist"
                aria-label="Cursor effect controls"
              >
                {(["pointer", "trail", "click", "drag"] as const).map(
                  (panel) => (
                    <button
                      key={panel}
                      role="tab"
                      aria-selected={cursorPanel === panel}
                      className={cursorPanel === panel ? "selected" : ""}
                      onClick={() => setCursorPanel(panel)}
                    >
                      {panel[0].toUpperCase() + panel.slice(1)}
                    </button>
                  ),
                )}
              </div>
              <EffectsPlayground settings={settings} />
              {cursorPanel === "pointer" && (
                <section className="control-section">
                  <h3>
                    Your cursor, with character
                    <span>Original styles for every kind of story.</span>
                  </h3>
                  <div className="cursor-grid cursor-shape-grid">
                    {(
                      [
                        { id: "arrow", label: "Classic" },
                        { id: "presenter", label: "Presenter" },
                        { id: "outline", label: "Outline" },
                        { id: "dot", label: "Dot" },
                        { id: "ring", label: "Halo" },
                        { id: "neon", label: "Neon" },
                        { id: "crosshair", label: "Focus" },
                        { id: "hand", label: "Hand" },
                        { id: "spotlight", label: "Spotlight" },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        aria-label={`${label} cursor`}
                        aria-pressed={settings.cursorStyle === id}
                        className={
                          settings.cursorStyle === id ? "selected" : ""
                        }
                        onClick={() => setSetting("cursorStyle", id)}
                      >
                        <CursorThumbnail settings={settings} style={id} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <EffectColor
                    label="Cursor color"
                    value={settings.cursorColor}
                    onChange={(v) => setSetting("cursorColor", v)}
                  />
                  <Slider
                    label="Cursor size"
                    value={settings.cursorSize}
                    min={12}
                    max={64}
                    suffix=" px"
                    onChange={(v) => setSetting("cursorSize", v)}
                  />
                  <Slider
                    label="Smoothing"
                    value={settings.smoothing}
                    onChange={(v) => setSetting("smoothing", v)}
                  />
                </section>
              )}
              {cursorPanel === "trail" && (
                <section className="control-section">
                  <h3>
                    Leave a little motion
                    <span>A visible tail that fades as you move.</span>
                  </h3>
                  <Toggle
                    label="Cursor trail"
                    description="Play the clip or move in the test pad."
                    value={settings.cursorTrail}
                    onChange={(v) => setSetting("cursorTrail", v)}
                  />
                  <div className="effect-options">
                    {(
                      [
                        {
                          id: "ribbon",
                          label: "Ribbon",
                          desc: "A continuous, tapered stroke.",
                        },
                        {
                          id: "comet",
                          label: "Comet",
                          desc: "A bright head with a soft tail.",
                        },
                        {
                          id: "ghost",
                          label: "Ghost",
                          desc: "A playful echo of your cursor.",
                        },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        aria-label={`${t.label} trail`}
                        aria-pressed={
                          settings.trailStyle === t.id && settings.cursorTrail
                        }
                        className={
                          settings.trailStyle === t.id && settings.cursorTrail
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          updateEdit((e) => ({
                            ...e,
                            settings: {
                              ...e.settings,
                              trailStyle: t.id,
                              cursorTrail: true,
                            },
                          }))
                        }
                      >
                        <span
                          className={`effect-glyph trail-${t.id}`}
                          aria-hidden="true"
                        />
                        <span>
                          {t.label}
                          <small>{t.desc}</small>
                        </span>
                        <span className="radio-dot" />
                      </button>
                    ))}
                  </div>
                  <Slider
                    label="Tail duration"
                    value={settings.trailDuration}
                    min={0.12}
                    max={1.2}
                    step={0.01}
                    suffix=" s"
                    onChange={(v) => setSetting("trailDuration", v)}
                  />
                  <Slider
                    label="Trail strength"
                    value={settings.trailOpacity}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(v) => setSetting("trailOpacity", v)}
                  />
                  <EffectColor
                    label="Trail color"
                    value={settings.cursorColor}
                    onChange={(v) => setSetting("cursorColor", v)}
                  />
                </section>
              )}
              {cursorPanel === "click" && (
                <section className="control-section">
                  <h3>
                    Make the moment land
                    <span>A little emphasis on every click.</span>
                  </h3>
                  <Toggle
                    label="Click effects"
                    description="Primary and secondary clicks are recorded."
                    value={settings.clickRipple}
                    onChange={(v) => setSetting("clickRipple", v)}
                  />
                  <div className="effect-options click-options">
                    {(
                      [
                        {
                          id: "ripple",
                          label: "Ripple",
                          desc: "Two soft rings, moving outward.",
                        },
                        {
                          id: "pulse",
                          label: "Pulse",
                          desc: "A bright, expanding highlight.",
                        },
                        {
                          id: "burst",
                          label: "Burst",
                          desc: "A small spark of celebration.",
                        },
                        {
                          id: "ring",
                          label: "Ring",
                          desc: "A crisp, deliberate target.",
                        },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        aria-label={`${c.label} click effect`}
                        aria-pressed={
                          settings.clickStyle === c.id && settings.clickRipple
                        }
                        className={
                          settings.clickStyle === c.id && settings.clickRipple
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          updateEdit((e) => ({
                            ...e,
                            settings: {
                              ...e.settings,
                              clickStyle: c.id,
                              clickRipple: true,
                            },
                          }))
                        }
                      >
                        <span
                          className={`effect-glyph click-${c.id}`}
                          aria-hidden="true"
                        />
                        <span>
                          {c.label}
                          <small>{c.desc}</small>
                        </span>
                        <span className="radio-dot" />
                      </button>
                    ))}
                  </div>
                  <EffectColor
                    label="Click color"
                    value={settings.clickColor}
                    onChange={(v) => setSetting("clickColor", v)}
                  />
                  <Slider
                    label="Click size"
                    value={settings.clickSize}
                    min={24}
                    max={120}
                    suffix=" px"
                    onChange={(v) => setSetting("clickSize", v)}
                  />
                </section>
              )}
              {cursorPanel === "drag" && (
                <section className="control-section">
                  <h3>
                    Follow the pull
                    <span>A clear cue from press to release.</span>
                  </h3>
                  <Toggle
                    label="Drag effects"
                    description="Tracks the pointer while a button is held."
                    value={settings.dragEffect}
                    onChange={(v) => setSetting("dragEffect", v)}
                  />
                  <div className="effect-options">
                    {(
                      [
                        {
                          id: "elastic",
                          label: "Elastic",
                          desc: "A tether from where you started.",
                        },
                        {
                          id: "path",
                          label: "Drag path",
                          desc: "A dotted route with a held ring.",
                        },
                        {
                          id: "selection",
                          label: "Selection",
                          desc: "A translucent selection rectangle.",
                        },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        aria-label={`${d.label} drag effect`}
                        aria-pressed={
                          settings.dragStyle === d.id && settings.dragEffect
                        }
                        className={
                          settings.dragStyle === d.id && settings.dragEffect
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          updateEdit((e) => ({
                            ...e,
                            settings: {
                              ...e.settings,
                              dragStyle: d.id,
                              dragEffect: true,
                            },
                          }))
                        }
                      >
                        <span
                          className={`effect-glyph drag-${d.id}`}
                          aria-hidden="true"
                        />
                        <span>
                          {d.label}
                          <small>{d.desc}</small>
                        </span>
                        <span className="radio-dot" />
                      </button>
                    ))}
                  </div>
                  <EffectColor
                    label="Drag color"
                    value={settings.dragColor}
                    onChange={(v) => setSetting("dragColor", v)}
                  />
                  {!pointers.some((p) => p.event === "down" || p.pressed) && (
                    <p className="effect-data-note">
                      This clip has no press-and-release data. New takes capture
                      it. The test pad lets you try it now.
                    </p>
                  )}
                </section>
              )}
              <section className="control-section cursor-master">
                <Toggle
                  label="Cursor effects"
                  description="Turn off if your source keeps its original cursor."
                  value={settings.showCursor}
                  onChange={(v) => setSetting("showCursor", v)}
                />
              </section>
              <div className="inspector-note">
                <MousePointer2 size={17} />
                <p>
                  {isDemo
                    ? "Press Space to watch these effects in the playground video."
                    : pointers.length
                      ? "Your cursor track is ready. Preview and export use the same effects."
                      : "Imported clips have no cursor track. Record a new take to capture it."}
                </p>
              </div>
            </>
          )}
          {tab === "motion" && (
            <>
              <section className="control-section">
                <h3>Movement</h3>
                <div className="motion-options">
                  {(
                    [
                      {
                        id: "smooth",
                        title: "Smooth",
                        desc: "Soft landings. No rush.",
                      },
                      {
                        id: "snappy",
                        title: "Snappy",
                        desc: "Straight to the good part.",
                      },
                      {
                        id: "float",
                        title: "Float",
                        desc: "A little cinematic drift.",
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      className={settings.motion === m.id ? "selected" : ""}
                      onClick={() => setSetting("motion", m.id)}
                    >
                      <span className={`motion-curve ${m.id}`}>
                        <svg viewBox="0 0 44 22">
                          <path
                            d={
                              m.id === "snappy"
                                ? "M2 20 C6 20 6 2 42 2"
                                : m.id === "float"
                                  ? "M2 20 C18 20 15 0 27 3 S35 6 42 2"
                                  : "M2 20 C24 20 18 2 42 2"
                            }
                          />
                        </svg>
                      </span>
                      <span>
                        {m.title}
                        <small>{m.desc}</small>
                      </span>
                      <span className="radio-dot" />
                    </button>
                  ))}
                </div>
              </section>
              <section className="control-section">
                <h3>Entrance</h3>
                <div className="segmented">
                  {(["none", "rise", "swoop", "pop"] as const).map((v) => (
                    <button
                      key={v}
                      className={settings.intro === v ? "selected" : ""}
                      onClick={() => {
                        setSetting("intro", v);
                        seek(0);
                        setPlaying(true);
                      }}
                    >
                      {v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </section>
              <section className="control-section zoom-inspector">
                <h3>
                  {selectedZoom ? "Selected zoom" : "Zoom moments"}
                  <span>
                    {selectedZoom
                      ? "Click the preview to set your focal point."
                      : "Select a moment in the timeline, or make a new one."}
                  </span>
                </h3>
                {selectedZoom ? (
                  <>
                    <div className="zoom-times">
                      <label>
                        Start
                        <input
                          aria-label="Zoom start"
                          type="number"
                          min={0}
                          max={selectedZoom.end - 0.2}
                          step={0.1}
                          value={Number(selectedZoom.start.toFixed(2))}
                          onChange={(e) =>
                            patchZoom(selectedZoom.id, {
                              start: clamp(
                                Number(e.target.value),
                                0,
                                selectedZoom.end - 0.2,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        End
                        <input
                          aria-label="Zoom end"
                          type="number"
                          min={selectedZoom.start + 0.2}
                          max={duration}
                          step={0.1}
                          value={Number(selectedZoom.end.toFixed(2))}
                          onChange={(e) =>
                            patchZoom(selectedZoom.id, {
                              end: clamp(
                                Number(e.target.value),
                                selectedZoom.start + 0.2,
                                duration,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <Slider
                      label="Magnification"
                      min={1}
                      max={3}
                      step={0.05}
                      suffix="×"
                      value={selectedZoom.scale}
                      onChange={(v) => patchZoom(selectedZoom.id, { scale: v })}
                    />
                    <Slider
                      label="Focus X"
                      max={1}
                      step={0.01}
                      value={selectedZoom.x}
                      onChange={(v) => patchZoom(selectedZoom.id, { x: v })}
                    />
                    <Slider
                      label="Focus Y"
                      max={1}
                      step={0.01}
                      value={selectedZoom.y}
                      onChange={(v) => patchZoom(selectedZoom.id, { y: v })}
                    />
                    <button
                      className="button danger-quiet full"
                      onClick={removeZoom}
                    >
                      <X size={14} />
                      Remove this zoom
                    </button>
                  </>
                ) : (
                  <button className="button subtle full" onClick={addZoom}>
                    <Plus size={15} />
                    Add zoom at playhead
                  </button>
                )}
              </section>
            </>
          )}
        </div>
        <div className="inspector-footer">
          <span className="keycap">space</span>
          <span>Play a little. Make it yours.</span>
        </div>
      </aside>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {native ? "Desktop studio" : "Browser preview"}
          <span className="status-divider">/</span>All rendering stays on this
          device
        </span>
        <div>
          <button
            disabled={recording || finishingTake || exporting}
            onClick={resetDemo}
          >
            <Clapperboard size={11} />
            Load playground
          </button>
          <span>v{appInfo?.version ?? "0.2.5"}</span>
        </div>
      </footer>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        hidden
        type="file"
        accept=".swoop,.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            try {
              await restoreProject(JSON.parse(await file.text()));
            } catch {
              setError("Could not read that project file.");
            }
          }
          if (projectInput.current) projectInput.current.value = "";
        }}
      />
      {sourceUrl && (
        <video
          ref={video}
          className="source-video"
          src={sourceUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            if (video.current) video.current.currentTime = state.current.time;
          }}
          onEnded={() => setPlaying(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            Dismiss
            <X size={14} />
          </button>
        </div>
      )}
      {showSources && (
        <div className="modal-backdrop">
          <section
            className="modal source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="New recording"
          >
            <div className="modal-heading">
              <div>
                <h2>What are we making?</h2>
                <p>Choose your screen. We’ll take care of the moves.</p>
              </div>
              <IconButton
                label="Close recording setup"
                onClick={() => setShowSources(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            {native ? (
              <div className="source-grid">
                {sourcesLoading ? (
                  <p className="loading-sources">
                    Finding screens and windows…
                  </p>
                ) : sources.length ? (
                  sources.map((source) => (
                    <button
                      key={source.id}
                      data-self={source.isSelf ? "true" : "false"}
                      className={selectedSource === source.id ? "selected" : ""}
                      onClick={() => {
                        setSelectedSource(source.id);
                        if (source.isSelf || source.name === document.title)
                          setMinimizeRecording(false);
                      }}
                    >
                      <img alt="" src={source.thumbnail} />
                      <span>{source.name}</span>
                      {selectedSource === source.id && <Check size={15} />}
                    </button>
                  ))
                ) : (
                  <p>No capture sources found. Open a window and try again.</p>
                )}
              </div>
            ) : (
              <div className="browser-capture-note">
                <Video size={34} />
                <p>
                  Your browser will ask you to choose a screen or window. Use
                  the desktop app for global cursor tracking and native exports.
                </p>
              </div>
            )}
            <div className="record-options">
              <Toggle
                label="Microphone"
                description="Add your voice to the take."
                value={microphone}
                onChange={setMicrophone}
              />
              <Toggle
                label="System audio"
                description={
                  native
                    ? "Records all system sounds on Windows."
                    : "Where supported by your selected source."
                }
                value={systemAudio}
                onChange={setSystemAudio}
              />
              {native &&
                (capturingSelf ? (
                  <p className="capture-self-note">
                    The studio stays visible while recording its own window.
                  </p>
                ) : (
                  <Toggle
                    label="Minimize studio"
                    description="Keep this workspace out of your recording."
                    value={minimizeRecording}
                    onChange={setMinimizeRecording}
                  />
                ))}
            </div>
            <p className="record-backup-note">
              {native
                ? "Your original take is backed up on this device as you record. Find it later in Recordings. Save a project separately to keep your edits."
                : "Browser recordings stay in this tab until you save or export. Use the desktop app for automatic recording backups."}
            </p>
            <div className="modal-footer">
              <span>
                <Circle size={9} fill="currentColor" />A short countdown, then
                you’re on.
              </span>
              <button
                className="button primary"
                disabled={native && !selectedSource}
                onClick={() => void beginRecord()}
              >
                <Circle size={12} fill="currentColor" />
                Start recording
              </button>
            </div>
          </section>
        </div>
      )}
      {countdown !== null && (
        <div className="countdown">
          <span>{countdown}</span>
          <p>Make a little magic.</p>
        </div>
      )}
      {finishingTake && (
        <div className="recording-dock" role="status">
          <Sparkles size={18} />
          <strong>Preparing your take…</strong>
        </div>
      )}
      {recording && (
        <div className="recording-dock" role="status">
          <span className={`record-light ${pausedRecording ? "paused" : ""}`} />
          <strong>{pausedRecording ? "Paused" : "Recording"}</strong>
          <span className="record-elapsed">{formatTime(recordTime, true)}</span>
          <IconButton
            label={pausedRecording ? "Resume recording" : "Pause recording"}
            onClick={pauseRecord}
          >
            {pausedRecording ? <Play size={17} /> : <Pause size={17} />}
          </IconButton>
          <button className="button primary" onClick={() => void stopRecord()}>
            <Square size={12} fill="currentColor" />
            Finish take
          </button>
        </div>
      )}
      {showExport && (
        <div className="modal-backdrop">
          <section
            className="modal export-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Export video"
          >
            <div className="modal-heading">
              <div>
                <h2>Ready for its close-up.</h2>
                <p>Your edit, your cursor, every little detail.</p>
              </div>
              <IconButton
                label="Close export"
                disabled={exporting}
                onClick={() => setShowExport(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <div className="export-preview">
              <Miniature settings={settings} />
              <div>
                <strong>{name}</strong>
                <span>
                  {formatTime(trimEnd - trimStart, true)} · {settings.aspect} ·
                  30 fps
                </span>
                <small>
                  {isDemo ? "Playground demo" : "Your recording"} with{" "}
                  {zooms.length} zoom moments
                </small>
              </div>
            </div>
            <div className="export-fields">
              <label>
                Format
                <select
                  aria-label="Export format"
                  value={format}
                  disabled={exporting}
                  onChange={(e) => setFormat(e.target.value as "mp4" | "webm")}
                >
                  <option value="webm">WebM · VP9 / VP8</option>
                  {appInfo?.ffmpeg && <option value="mp4">MP4 · H.264</option>}
                </select>
              </label>
              <label>
                Quality
                <select
                  aria-label="Export quality"
                  value={resolution}
                  disabled={exporting}
                  onChange={(e) => setResolution(Number(e.target.value))}
                >
                  <option value={720}>720p · quicker</option>
                  <option value={1080}>1080p · crisp</option>
                  <option value={1440}>1440p · extra detail</option>
                </select>
              </label>
            </div>
            {exporting ? (
              <div
                className="export-progress"
                role="progressbar"
                aria-valuenow={Math.round(exportProgress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div>
                  <span>{exportPhase}</span>
                  <strong>{Math.round(exportProgress * 100)}%</strong>
                </div>
                <span>
                  <i style={{ width: `${exportProgress * 100}%` }} />
                </span>
                <p>Rendering happens in real time. Keep the studio open.</p>
              </div>
            ) : (
              <p className="export-note">
                Includes your trim, frame, cursor effects and zooms. Source
                audio is preserved when present. No watermark.
              </p>
            )}
            <div className="modal-footer">
              <span>
                <span className="local-dot" />
                Rendered on your device
              </span>
              {exporting ? (
                <button
                  className="button subtle"
                  disabled={exportPhase !== "Rendering your frames"}
                  onClick={() => abortExport.current?.abort()}
                >
                  Cancel render
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => void doExport()}
                >
                  <Download size={16} />
                  Export {format.toUpperCase()}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {showRecordings && (
        <RecordingsDialog
          takes={savedTakes}
          directory={takesDirectory}
          busy={recoveringTake}
          loading={takesLoading}
          error={takesError}
          onOpen={(take) => void recoverTake(take)}
          onClose={() => setShowRecordings(false)}
          onRefresh={() => void refreshTakes()}
          onShowFolder={() => void showTakesFolder()}
        />
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="modal-heading">
              <div>
                <h2>A few good shortcuts.</h2>
                <p>Less clicking. More making.</p>
              </div>
              <IconButton
                label="Close keyboard shortcuts"
                onClick={() => setHelp(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <div className="shortcut-list">
              {[
                ["Space", "Play / pause"],
                ["← / →", "Step one frame"],
                ["Shift + ← / →", "Jump one second"],
                ["Z", "Add a zoom"],
                ["Delete", "Remove selected zoom"],
                ["Ctrl + Z", "Undo"],
                ["Ctrl + Shift + Z", "Redo"],
                ["Ctrl + S", "Save project"],
                ["Ctrl + O", "Open project"],
                ["Ctrl + E", "Export video"],
                ["Esc", "Stop recording / close panel"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="help-note">
              Drag a zoom to move it. Pull its edges to change its timing.
              Select it, then click the video to choose what matters.
            </p>
            <div className="help-demo">
              <div>
                <strong>See the effects in motion.</strong>
                <span>
                  A short playground export, included for offline viewing.
                </span>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setHelp(false);
                  setPlaying(false);
                  setDemoVideoError(false);
                  setShowDemoVideo(true);
                }}
              >
                <Play size={15} />
                Watch included demo
              </button>
            </div>
          </section>
        </div>
      )}
      {showDemoVideo && (
        <div className="modal-backdrop">
          <section
            className="modal demo-video-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Included Swoop demo"
          >
            <div className="modal-heading">
              <div>
                <h2>A little movement. A lot of personality.</h2>
                <p>Included playground demo · 9 seconds · plays offline</p>
              </div>
              <IconButton
                label="Close demo video"
                onClick={() => setShowDemoVideo(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            {demoVideoError ? (
              <p className="demo-video-error" role="alert">
                The included demo could not be played. You can still try the
                editable playground from the studio.
              </p>
            ) : (
              <video
                className="demo-video-player"
                aria-label="Swoop cursor effects demo"
                src={`${import.meta.env.BASE_URL}demo/Swoop-Studio-Demo.mp4`}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => setDemoVideoError(true)}
              />
            )}
            <p className="help-note demo-video-note">
              Presenter cursor, Ribbon trail, Burst clicks and Elastic drag,
              exported from Swoop’s editable playground.
            </p>
            <div className="modal-footer">
              <span>
                The video plays inside Swoop. No internet connection needed.
              </span>
              <button
                className="button secondary"
                onClick={() => {
                  setShowDemoVideo(false);
                  setHelp(true);
                }}
              >
                <ArrowLeft size={15} />
                Back to help
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
