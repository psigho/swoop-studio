import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import {
  drawPointerLayer,
  type PointerSample,
  type StudioSettings,
} from "../studio";

const cycle = 3.6;
function autoPoint(t: number): PointerSample {
  const phase = ((t % cycle) + cycle) % cycle;
  return {
    t,
    x: 0.5 - 0.34 * Math.cos((phase / cycle) * Math.PI * 2),
    y: 0.5 + 0.18 * Math.sin((phase / cycle) * Math.PI * 4),
    pressed: (phase >= 0.65 && phase < 0.72) || (phase >= 1.6 && phase < 2.7),
    event: "move",
    visible: true,
  };
}
function autoHistory(now: number): PointerSample[] {
  const points: PointerSample[] = [];
  for (let t = Math.max(0, now - 1.5); t <= now; t += 1 / 60)
    points.push(autoPoint(t));
  for (
    let c = Math.floor((now - 1.5) / cycle);
    c <= Math.floor(now / cycle);
    c++
  ) {
    for (const [phase, event] of [
      [0.65, "down"],
      [0.72, "up"],
      [1.6, "down"],
      [2.7, "up"],
    ] as const) {
      const t = c * cycle + phase;
      if (t < 0 || t > now || t < now - 1.5) continue;
      points.push({
        ...autoPoint(t),
        event,
        pressed: event === "down",
        button: 1,
        ...(event === "down" ? { click: true } : {}),
      });
    }
  }
  return points.sort((a, b) => a.t - b.t);
}

export function CursorThumbnail({
  settings,
  style,
}: {
  settings: StudioSettings;
  style: StudioSettings["cursorStyle"];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawPointerLayer(ctx, {
      width: 112,
      height: 72,
      time: 1,
      settings: {
        ...settings,
        showCursor: true,
        cursorStyle: style,
        cursorTrail: false,
        clickRipple: false,
        dragEffect: false,
        cursorSize: 32,
      },
      pointers: [{ t: 0, x: 0.47, y: 0.44 }],
      cursorScale: 0.85,
    });
  }, [settings, style]);
  return <canvas ref={ref} width={112} height={72} aria-hidden="true" />;
}

export default function EffectsPlayground({
  settings,
}: {
  settings: StudioSettings;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    samples = useRef<PointerSample[]>([]),
    start = useRef(performance.now()),
    pressed = useRef(false),
    visible = useRef(true),
    settingsRef = useRef(settings),
    modeRef = useRef(true);
  const [auto, setAuto] = useState(true);
  settingsRef.current = settings;
  modeRef.current = auto;
  const now = () => Math.max(0, (performance.now() - start.current) / 1000);
  function sample(
    e: React.PointerEvent<HTMLCanvasElement>,
    event: PointerSample["event"] = "move",
  ) {
    if (modeRef.current) {
      samples.current = [];
      modeRef.current = false;
      setAuto(false);
    }
    const r = e.currentTarget.getBoundingClientRect();
    const point: PointerSample = {
      t: now(),
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      event,
      pressed: pressed.current,
      visible: true,
    };
    if (event === "down") {
      point.click = true;
      point.button = e.button === 2 ? 2 : 1;
    }
    if (event === "up") point.button = e.button === 2 ? 2 : 1;
    samples.current = [...samples.current.slice(-1799), point];
  }
  useEffect(() => {
    let raf = 0;
    const c = canvas.current;
    if (!c) return;
    const observer = new IntersectionObserver((entries) => {
      visible.current = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(c);
    const render = () => {
      if (visible.current) {
        const ctx = c.getContext("2d")!,
          time = now();
        ctx.clearRect(0, 0, 320, 166);
        ctx.fillStyle = "#171f17";
        ctx.fillRect(0, 0, 320, 166);
        ctx.fillStyle = "#4d5f4580";
        for (let x = 12; x < 320; x += 16)
          for (let y = 12; y < 166; y += 16) ctx.fillRect(x, y, 1, 1);
        ctx.strokeStyle = "#586f4540";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.strokeRect(34, 40, 250, 90);
        ctx.setLineDash([]);
        drawPointerLayer(ctx, {
          width: 320,
          height: 166,
          time,
          settings: settingsRef.current,
          pointers: modeRef.current ? autoHistory(time) : samples.current,
          cursorScale: 0.75,
        });
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  return (
    <div className="effects-playground">
      <div className="effects-playground-heading">
        <strong>Try it here</strong>
        <button
          onClick={() => {
            pressed.current = false;
            samples.current = [];
            start.current = performance.now();
            setAuto(true);
          }}
          title="Run effects demo"
        >
          <Play size={10} fill="currentColor" />
          {auto ? "Demo running" : "Run demo"}
        </button>
      </div>
      <div className="effects-playground-pad">
        <canvas
          ref={canvas}
          width={320}
          height={166}
          aria-label="Effects playground: move, click and drag here"
          tabIndex={0}
          style={{ cursor: settings.showCursor ? "none" : "crosshair" }}
          onPointerMove={(e) => sample(e)}
          onPointerEnter={(e) => sample(e)}
          onPointerDown={(e) => {
            pressed.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            sample(e, "down");
          }}
          onPointerUp={(e) => {
            pressed.current = false;
            sample(e, "up");
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            pressed.current = false;
            sample(e, "up");
          }}
          onLostPointerCapture={(e) => {
            if (pressed.current) {
              pressed.current = false;
              sample(e, "up");
            }
          }}
          onPointerLeave={(e) => {
            if (!pressed.current) {
              sample(e);
              samples.current[samples.current.length - 1].visible = false;
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
        <span className="playground-caption">
          {settings.showCursor
            ? "Move · click · hold & drag"
            : "Turn on Cursor effects to preview"}
        </span>
        <span className={`playground-mode ${auto ? "" : "live"}`}>
          {auto ? "DEMO" : "LIVE"}
        </span>
      </div>
    </div>
  );
}
