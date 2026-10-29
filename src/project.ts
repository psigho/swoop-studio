import {
  DEFAULT_SETTINGS,
  type PointerSample,
  type TypingBurst,
  type StudioSettings,
  type ZoomRegion,
} from "./studio";

export type ProjectPointer = PointerSample & {
  visible?: boolean;
  button?: number;
};
export type SwoopProject = {
  schemaVersion: 1;
  name: string;
  isDemo: boolean;
  duration: number;
  settings: StudioSettings;
  zooms: ZoomRegion[];
  pointers: ProjectPointer[];
  typing?: TypingBurst[];
  trimStart: number;
  trimEnd: number;
  mediaBase64?: string;
  mediaType?: string;
};

const MAX_DURATION = 24 * 60 * 60;
const MAX_POINTERS = 2_000_000;
const MAX_ZOOMS = 10_000;
const MAX_BASE64 = 256 * 1024 * 1024;
const MIME =
  /^video\/(?:webm|mp4|quicktime|x-matroska|matroska|x-m4v|ogg|mpeg|avi|x-msvideo)(?:\s*;\s*codecs=(?:"[a-z0-9., _-]+"|[a-z0-9., _-]+))?$/i;

function fail(message: string): never {
  throw new Error(message);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(`${label} must be a number between ${min} and ${max}.`);
  }
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be true or false.`);
  return value;
}
function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    fail(`${label} is not a supported option.`);
  return value as T;
}

function settings(value: unknown): StudioSettings {
  const input = record(value, "Project settings");
  const result = { ...DEFAULT_SETTINGS };
  const ranges = {
    padding: [0, 100],
    roundness: [0, 50],
    shadow: [0, 100],
    cursorSize: [12, 64],
    smoothing: [0, 100],
    trailDuration: [0.12, 1.2],
    trailOpacity: [0, 100],
    clickSize: [24, 120],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const [min, max] = ranges[key];
    if (Object.hasOwn(input, key))
      result[key] = number(input[key], `Setting ${key}`, min, max);
  }
  if (Object.hasOwn(input, "background"))
    result.background = enumValue(
      input.background,
      ["lagoon", "sunset", "mono", "candy", "mesh", "cream"],
      "Background",
    );
  if (Object.hasOwn(input, "aspect"))
    result.aspect = enumValue(
      input.aspect,
      ["16:9", "9:16", "1:1", "4:3"],
      "Aspect ratio",
    );
  if (Object.hasOwn(input, "cursorStyle"))
    result.cursorStyle = enumValue(
      input.cursorStyle,
      [
        "arrow",
        "dot",
        "ring",
        "crosshair",
        "hand",
        "presenter",
        "outline",
        "neon",
        "spotlight",
      ],
      "Cursor style",
    );
  if (Object.hasOwn(input, "trailStyle"))
    result.trailStyle = enumValue(
      input.trailStyle,
      ["ribbon", "comet", "ghost"],
      "Trail style",
    );
  if (Object.hasOwn(input, "clickStyle"))
    result.clickStyle = enumValue(
      input.clickStyle,
      ["ripple", "pulse", "burst", "ring"],
      "Click style",
    );
  if (Object.hasOwn(input, "dragStyle"))
    result.dragStyle = enumValue(
      input.dragStyle,
      ["elastic", "path", "selection"],
      "Drag style",
    );
  if (Object.hasOwn(input, "motion"))
    result.motion = enumValue(
      input.motion,
      ["smooth", "snappy", "float"],
      "Motion",
    );
  if (Object.hasOwn(input, "cameraFrame"))
    result.cameraFrame = enumValue(
      input.cameraFrame,
      ["none", "mac", "browser"],
      "Window frame",
    );
  if (Object.hasOwn(input, "intro"))
    result.intro = enumValue(
      input.intro,
      ["none", "rise", "swoop", "pop"],
      "Entrance",
    );
  for (const key of [
    "showCursor",
    "cursorTrail",
    "clickRipple",
    "dragEffect",
    "grain",
  ] as const) {
    if (Object.hasOwn(input, key))
      result[key] = boolean(input[key], `Setting ${key}`);
  }
  for (const key of ["cursorColor", "clickColor", "dragColor"] as const) {
    if (Object.hasOwn(input, key)) {
      if (typeof input[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(input[key]))
        fail(`${key} must be a six-digit hex color, such as #ffffff.`);
      result[key] = input[key];
    }
  }
  return result;
}

function videoBase64(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    fail("This project has no embedded recording.");
  if (value.length > MAX_BASE64)
    fail(
      "The embedded recording is too large. Open a project with less than 192 MB of video.",
    );
  if (value.length % 4 !== 0 || /[^a-z0-9+/=]/i.test(value))
    fail("The embedded recording contains invalid video data.");
  const padding = value.indexOf("=");
  if (
    padding !== -1 &&
    (value.length - padding > 2 || !/^={1,2}$/.test(value.slice(padding)))
  ) {
    fail("The embedded recording contains invalid video data.");
  }
  return value;
}

/** A codec list can contain commas before the actual base64 payload delimiter. */
export function embeddedBase64(dataUrl: string): string {
  const marker = ";base64,";
  const index = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith("data:") || index < 0)
    fail("Could not read the embedded video.");
  return videoBase64(dataUrl.slice(index + marker.length));
}

/** Validate local project data before it reaches controls, canvas, or a decoder. */
export function parseProject(data: unknown): SwoopProject {
  const input = record(data, "Swoop project");
  if (input.schemaVersion !== 1)
    fail(
      "This project uses an unsupported format. Open a Swoop version 1 project.",
    );
  if (
    typeof input.name !== "string" ||
    input.name.trim().length < 1 ||
    input.name.length > 80 ||
    /[\u0000-\u001f]/.test(input.name)
  ) {
    fail("Project name must contain between 1 and 80 characters.");
  }
  const isDemo = boolean(input.isDemo, "Project demo flag");
  const duration = number(input.duration, "Project duration", 0, MAX_DURATION);
  if (duration === 0) fail("Project duration must be greater than zero.");
  const safeSettings = settings(input.settings);
  if (!Array.isArray(input.zooms) || input.zooms.length > MAX_ZOOMS)
    fail(
      "A project must contain an array with no more than 10,000 zoom regions.",
    );
  if (!Array.isArray(input.pointers) || input.pointers.length > MAX_POINTERS)
    fail(
      "A project must contain an array with no more than 2,000,000 cursor samples.",
    );
  const seenIds = new Set<string>();
  const zooms = input.zooms
    .map((value, index): ZoomRegion => {
      const zoom = record(value, `Zoom ${index + 1}`);
      if (
        typeof zoom.id !== "string" ||
        !zoom.id.length ||
        zoom.id.length > 128 ||
        seenIds.has(zoom.id)
      )
        fail("Every zoom must have a unique, nonempty id.");
      seenIds.add(zoom.id);
      const start = number(zoom.start, `Zoom ${index + 1} start`, 0, duration);
      const end = number(zoom.end, `Zoom ${index + 1} end`, 0, duration);
      if (end <= start) fail(`Zoom ${index + 1} must end after it starts.`);
      return {
        id: zoom.id,
        start,
        end,
        x: number(zoom.x, `Zoom ${index + 1} horizontal focus`, 0, 1),
        y: number(zoom.y, `Zoom ${index + 1} vertical focus`, 0, 1),
        scale: number(zoom.scale, `Zoom ${index + 1} scale`, 1, 3),
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const pointers = input.pointers
    .map((value, index): ProjectPointer => {
      const pointer = record(value, `Cursor sample ${index + 1}`);
      const parsed: ProjectPointer = {
        t: number(pointer.t, `Cursor sample ${index + 1} time`, 0, duration),
        x: number(
          pointer.x,
          `Cursor sample ${index + 1} horizontal position`,
          0,
          1,
        ),
        y: number(
          pointer.y,
          `Cursor sample ${index + 1} vertical position`,
          0,
          1,
        ),
      };
      if (Object.hasOwn(pointer, "click"))
        parsed.click = boolean(
          pointer.click,
          `Cursor sample ${index + 1} click`,
        );
      if (Object.hasOwn(pointer, "visible"))
        parsed.visible = boolean(
          pointer.visible,
          `Cursor sample ${index + 1} visibility`,
        );
      if (Object.hasOwn(pointer, "pressed"))
        parsed.pressed = boolean(
          pointer.pressed,
          `Cursor sample ${index + 1} pressed state`,
        );
      if (Object.hasOwn(pointer, "event"))
        parsed.event = enumValue(
          pointer.event,
          ["move", "down", "up"] as const,
          `Cursor sample ${index + 1} event`,
        );
      if (Object.hasOwn(pointer, "button")) {
        parsed.button = number(
          pointer.button,
          `Cursor sample ${index + 1} button`,
          0,
          8,
        );
        if (!Number.isInteger(parsed.button))
          fail("Cursor button must be a whole number.");
      }
      return parsed;
    })
    .sort((a, b) => a.t - b.t);
  const trimStart = Object.hasOwn(input, "trimStart")
    ? number(input.trimStart, "Trim start", 0, duration)
    : 0;
  const trimEnd = Object.hasOwn(input, "trimEnd")
    ? number(input.trimEnd, "Trim end", 0, duration)
    : duration;
  if (trimEnd <= trimStart) fail("Trim end must be after trim start.");
  const project: SwoopProject = {
    schemaVersion: 1,
    name: input.name.trim(),
    isDemo,
    duration,
    settings: safeSettings,
    zooms,
    pointers,
    ...(input.typing === undefined
      ? {}
      : { typing: parseTyping(input.typing, duration) }),
    trimStart,
    trimEnd,
  };
  if (!isDemo) {
    project.mediaBase64 = videoBase64(input.mediaBase64);
    if (input.mediaType !== undefined && input.mediaType !== "") {
      if (
        typeof input.mediaType !== "string" ||
        input.mediaType.length > 160 ||
        !MIME.test(input.mediaType)
      )
        fail(
          "The embedded recording must use a supported video format, such as WebM or MP4.",
        );
      project.mediaType = input.mediaType;
    } else project.mediaType = "video/webm";
  }
  return project;
}

/** Backward compatible: old projects have no typing metadata. */
function parseTyping(value: unknown, duration: number): TypingBurst[] {
  if (!Array.isArray(value) || value.length > 10000)
    fail("Too many typing regions.");
  return value
    .map((item, index) => {
      const b = record(item, `Typing region ${index + 1}`);
      const start = number(b.start, "Typing start", 0, duration),
        end = number(b.end, "Typing end", 0, duration);
      if (end <= start) fail("Typing must end after it starts.");
      return {
        start,
        end,
        x: number(b.x, "Typing horizontal position", 0, 1),
        y: number(b.y, "Typing vertical position", 0, 1),
      };
    })
    .sort((a, b) => a.start - b.start);
}
