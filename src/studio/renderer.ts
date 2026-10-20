import { drawDemo, DEMO_HEIGHT, DEMO_WIDTH } from "./demo";
import { cameraAt, clamp, ease, lerp, samplePointer } from "./motion";
import { clicksAt, dragAt, sampleTrail } from "./effects";
import { buildTrailGeometry, limitTrailLength } from "./trail-geometry";
import type { FrameOptions, StudioSettings } from "./types";

type Palette = [string, string, string, string];
const PALETTES: Record<StudioSettings["background"], Palette> = {
  lagoon: ["#c8dfcf", "#8aa89b", "#3d625a", "#e3ecdb"],
  sunset: ["#f7d7bb", "#d38a6d", "#916267", "#fff1d4"],
  mono: ["#484b4c", "#282c30", "#171b20", "#727976"],
  candy: ["#edcfe6", "#aa9bc8", "#6b6e9b", "#fce6df"],
  mesh: ["#c1dcd7", "#729aaf", "#4b668a", "#d4ecb7"],
  cream: ["#f1e9d8", "#ded1bd", "#b9aa92", "#fff9ea"],
};
const backgroundCache = new WeakMap<
  CanvasRenderingContext2D,
  { key: string; canvas: HTMLCanvasElement }
>();

/** Exact source rectangle after aspect fitting, background padding and chrome. */
export function getContentRect(
  width: number,
  height: number,
  settings: StudioSettings,
  sourceWidth = DEMO_WIDTH,
  sourceHeight = DEMO_HEIGHT,
) {
  const base = Math.min(width, height) / 720;
  const padding = clamp(settings.padding, 0, 100) * base;
  const chrome = settings.cameraFrame === "none" ? 0 : 32 * base;
  const fit = Math.min(
    Math.max(32, width - padding * 2) / sourceWidth,
    Math.max(32, height - padding * 2 - chrome) / sourceHeight,
  );
  const w = sourceWidth * fit;
  const h = sourceHeight * fit;
  return {
    x: (width - w) / 2,
    y: (height - h - chrome) / 2 + chrome,
    width: w,
    height: h,
  };
}

/** Map a preview click back through the cinematic camera to normalized source coordinates. */
export function sourcePointAt(
  canvasX: number,
  canvasY: number,
  options: FrameOptions,
): { x: number; y: number } | null {
  const { width, height, settings } = options;
  const sourceW = options.isDemo
    ? DEMO_WIDTH
    : options.video?.videoWidth || 1920;
  const sourceH = options.isDemo
    ? DEMO_HEIGHT
    : options.video?.videoHeight || 1080;
  const intro =
    settings.intro === "none"
      ? 1
      : ease(Math.max(0, options.time) / 0.8, settings.motion);
  let x = canvasX;
  let y = canvasY;
  if (settings.intro === "rise") y -= (1 - intro) * height * 0.1;
  if (settings.intro === "swoop" || settings.intro === "pop") {
    const scale =
      settings.intro === "swoop" ? lerp(0.88, 1, intro) : lerp(0.8, 1, intro);
    const angle = settings.intro === "swoop" ? (1 - intro) * -0.035 : 0;
    const dx = x - width / 2;
    const dy =
      y -
      (height / 2 +
        (settings.intro === "swoop" ? (1 - intro) * height * 0.12 : 0));
    x = (dx * Math.cos(angle) + dy * Math.sin(angle)) / scale + width / 2;
    y = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / scale + height / 2;
  }
  const rect = getContentRect(width, height, settings, sourceW, sourceH);
  if (
    x < rect.x ||
    y < rect.y ||
    x > rect.x + rect.width ||
    y > rect.y + rect.height
  )
    return null;
  const camera = cameraAt(options.zooms, options.time, settings.motion);
  return {
    x: clamp(camera.x + ((x - rect.x) / rect.width - 0.5) / camera.scale),
    y: clamp(camera.y + ((y - rect.y) / rect.height - 0.5) / camera.scale),
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: StudioSettings,
) {
  const [a, b, c, light] = PALETTES[settings.background] ?? PALETTES.lagoon;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, a);
  gradient.addColorStop(0.55, b);
  gradient.addColorStop(1, c);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(
    width * 0.12,
    -height * 0.1,
    0,
    width * 0.12,
    -height * 0.1,
    width * 0.8,
  );
  glow.addColorStop(0, `${light}b3`);
  glow.addColorStop(1, `${light}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.085;
  ctx.strokeStyle = light;
  ctx.lineWidth = width / 1920;
  const originX = width * 1.06;
  const originY = height * 0.96;
  for (let i = 0; i < 11; i++) {
    ctx.beginPath();
    ctx.ellipse(
      originX,
      originY,
      width * (0.11 + i * 0.046),
      height * (0.22 + i * 0.074),
      -0.44,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
  if (settings.grain) {
    // Deterministic stipple, intentionally static so video encoding stays efficient.
    ctx.save();
    ctx.fillStyle = settings.background === "mono" ? "#ffffff" : "#173c28";
    ctx.globalAlpha = 0.038;
    const step = Math.max(4, Math.round(width / 330));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (hash % 3 === 0)
          ctx.fillRect(x + (hash % step), y + ((hash >> 4) % step), 1, 1);
      }
    }
    ctx.restore();
  }
}

export function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  style: StudioSettings["cursorStyle"],
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#17372cc9";
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "#071a2c50";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  if (style === "presenter" || style === "spotlight") {
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = style === "presenter" ? "#ffe46155" : `${color}24`;
    ctx.strokeStyle = style === "presenter" ? "#efbd4180" : "#17372c70";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, style === "presenter" ? 23 : 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#17211eff";
    ctx.lineWidth = 1.6;
  }
  if (style === "dot") {
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === "ring") {
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "crosshair") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    for (const [x1, y1, x2, y2] of [
      [-14, 0, -5, 0],
      [5, 0, 14, 0],
      [0, -14, 0, -5],
      [0, 5, 0, 14],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "hand") {
    ctx.beginPath();
    ctx.moveTo(2, 19);
    ctx.lineTo(-6, 9);
    ctx.bezierCurveTo(-10, 3, -5, 0, -2, 4);
    ctx.lineTo(1, 8);
    ctx.lineTo(1, -9);
    ctx.bezierCurveTo(1, -14, 7, -14, 7, -9);
    ctx.lineTo(7, 2);
    ctx.bezierCurveTo(7, -3, 13, -3, 13, 2);
    ctx.bezierCurveTo(13, -2, 19, -1, 19, 4);
    ctx.bezierCurveTo(21, 0, 25, 3, 24, 8);
    ctx.lineTo(22, 20);
    ctx.quadraticCurveTo(21, 23, 17, 23);
    ctx.lineTo(7, 23);
    ctx.quadraticCurveTo(4, 23, 2, 19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 28);
    ctx.lineTo(7.4, 21.1);
    ctx.lineTo(13.8, 33);
    ctx.lineTo(19.5, 29.9);
    ctx.lineTo(13.1, 18.3);
    ctx.lineTo(23, 17);
    ctx.closePath();
    if (style === "outline") {
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#10211e";
    } else if (style === "neon") {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#10211ee6";
      ctx.stroke();
      ctx.fillStyle = "#182c2b";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawClickEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  size: number,
  style: StudioSettings["clickStyle"],
  color: string,
) {
  const eased = ease(progress, "snappy");
  const fade = Math.pow(1 - progress, 1.25);
  const radius = size * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.shadowColor = "#081b2180";
  ctx.shadowBlur = 2;
  if (style === "pulse") {
    ctx.globalAlpha *= fade * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.25 + eased * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.3;
    ctx.lineWidth = Math.max(1.5, size * 0.035);
    ctx.stroke();
  } else if (style === "burst") {
    ctx.globalAlpha *= fade;
    ctx.lineWidth = Math.max(1.5, size * 0.04 * (1 - progress * 0.5));
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + Math.PI / 8;
      const inner = radius * (0.25 + eased * 0.55);
      const outer = inner + radius * 0.32 * (1 - progress * 0.7);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.16 * (1 - eased), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const ring = radius * (0.18 + eased * 0.82);
    ctx.globalAlpha *= fade * 0.95;
    ctx.lineWidth = Math.max(1.5, size * 0.045 * (1 - progress * 0.55));
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.stroke();
    if (style === "ring") {
      ctx.globalAlpha *= 0.6;
      ctx.lineWidth *= 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, ring * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.globalAlpha *= 0.2;
      ctx.fill();
      // A second delayed wave makes repeated taps readable on both pale and
      // dark screen recordings without painting over the UI beneath them.
      if (progress > 0.13) {
        ctx.globalAlpha /= 0.3;
        ctx.lineWidth *= 0.7;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          radius * (0.1 + ease((progress - 0.13) / 0.87, "snappy") * 0.68),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function fillTrailGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: ReturnType<typeof buildTrailGeometry>,
) {
  ctx.beginPath();
  for (const quad of geometry.quads) {
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
  }
  for (const disk of geometry.disks) {
    ctx.moveTo(disk.x + disk.radius, disk.y);
    ctx.arc(disk.x, disk.y, disk.radius, 0, Math.PI * 2);
    ctx.closePath();
  }
  ctx.fill();
}

/** Draw all interaction graphics in source coordinates, shared by preview/export. */
export function drawPointerLayer(
  ctx: CanvasRenderingContext2D,
  options: {
    width: number;
    height: number;
    time: number;
    settings: StudioSettings;
    pointers: FrameOptions["pointers"];
    cursorScale?: number;
  },
) {
  const { settings, pointers, width: sourceW, height: sourceH, time } = options;
  if (settings.showCursor === false) return;
  const unit = options.cursorScale ?? sourceW / 1440;
  const cursorSize = settings.cursorSize * unit;
  const pointer = samplePointer(pointers, time, settings.smoothing);
  const drag = settings.dragEffect
    ? dragAt(pointers, time, settings.smoothing)
    : null;
  if (drag) {
    const x = drag.start.x * sourceW;
    const y = drag.start.y * sourceH;
    const hx = drag.head.x * sourceW;
    const hy = drag.head.y * sourceH;
    const color = settings.dragColor;
    const fade = 1 - ease(drag.releaseProgress);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 3 * unit;
    const inheritedAlpha = ctx.globalAlpha;
    ctx.globalAlpha *= fade;
    if (settings.dragStyle === "selection") {
      ctx.globalAlpha *= 0.12;
      ctx.fillRect(
        Math.min(x, hx),
        Math.min(y, hy),
        Math.abs(hx - x),
        Math.abs(hy - y),
      );
      ctx.globalAlpha /= 0.12;
      ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.lineDashOffset = -time * 20 * unit;
      ctx.strokeRect(
        Math.min(x, hx),
        Math.min(y, hy),
        Math.abs(hx - x),
        Math.abs(hy - y),
      );
    } else if (settings.dragStyle === "path") {
      ctx.globalAlpha *= 0.8;
      ctx.lineWidth = 4 * unit;
      ctx.beginPath();
      drag.path.forEach((point, i) => {
        if (!i) ctx.moveTo(point.x * sourceW, point.y * sourceH);
        else ctx.lineTo(point.x * sourceW, point.y * sourceH);
      });
      ctx.stroke();
      ctx.setLineDash([2 * unit, 10 * unit]);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * unit;
      ctx.stroke();
    } else {
      const distance = Math.hypot(hx - x, hy - y);
      const bend =
        Math.min(42 * unit, distance * 0.12) * Math.sin(drag.elapsed * 5);
      const nx = -(hy - y) / Math.max(distance, 1);
      const ny = (hx - x) / Math.max(distance, 1);
      ctx.globalAlpha *= 0.72;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        (x + hx) / 2 + nx * bend,
        (y + hy) / 2 + ny * bend,
        hx,
        hy,
      );
      ctx.stroke();
      ctx.globalAlpha *= 0.32;
      ctx.beginPath();
      ctx.arc(hx, hy, cursorSize * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = inheritedAlpha * fade * 0.9;
    ctx.lineWidth = 2 * unit;
    ctx.beginPath();
    ctx.arc(x, y, 5 * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#10221d";
    ctx.stroke();
    ctx.restore();
  }
  const clicks = clicksAt(pointers, time);
  if (settings.clickRipple) {
    for (const click of clicks)
      drawClickEffect(
        ctx,
        click.x * sourceW,
        click.y * sourceH,
        click.progress,
        settings.clickSize * unit,
        settings.clickStyle,
        settings.clickColor,
      );
  }
  if (settings.cursorTrail && pointer && pointer.visible !== false) {
    const trail = sampleTrail(
      pointers,
      time,
      settings.trailDuration,
      settings.smoothing,
    );
    const opacity = clamp(settings.trailOpacity / 100);
    const centers = trail.map((point) => ({
      ...point,
      x: point.x * sourceW,
      y: point.y * sourceH,
    }));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const sourceAlpha = ctx.globalAlpha;
    if (settings.trailStyle === "ghost") {
      const ghosts = limitTrailLength(centers, cursorSize * 8);
      const step = Math.max(4, Math.ceil(ghosts.length / 8));
      for (let i = 0; i < ghosts.length - 2; i += step) {
        const point = ghosts[i];
        if (
          Math.hypot(
            pointer.x * sourceW - point.x,
            pointer.y * sourceH - point.y,
          ) <
          cursorSize * 0.3
        )
          continue;
        ctx.globalAlpha =
          sourceAlpha * opacity * Math.pow(point.strength, 1.2) * 0.55;
        drawCursor(
          ctx,
          point.x,
          point.y,
          cursorSize * (0.65 + point.strength * 0.35),
          settings.cursorStyle,
          settings.cursorColor,
        );
      }
    } else {
      const radius =
        cursorSize * (settings.trailStyle === "comet" ? 0.24 : 0.12);
      const geometry = buildTrailGeometry(centers, cursorSize * 8, radius);
      if (geometry.disks.length) {
        // One fill takes the union of the rounded segments. Offset contours can
        // cross at U-turns; separate translucent strokes produce dark beads.
        // Age/arc-length taper keeps loops smooth without an endpoint gradient.
        // Fill a slightly wider union beneath the color to keep pale cursors
        // visible on pale screens. Stroking individual subpaths would expose
        // every internal disk/quad seam and bring the dark beads back.
        const outline = buildTrailGeometry(
          centers,
          cursorSize * 8,
          radius + 1.35 * unit,
        );
        ctx.globalAlpha = sourceAlpha * opacity * 0.72;
        ctx.fillStyle = "#17372c";
        ctx.shadowColor =
          settings.trailStyle === "comet" ? settings.cursorColor : "#102b2355";
        ctx.shadowBlur = (settings.trailStyle === "comet" ? 8 : 2) * unit;
        fillTrailGeometry(ctx, outline);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.globalAlpha = sourceAlpha * opacity * 0.92;
        ctx.fillStyle = settings.cursorColor;
        fillTrailGeometry(ctx, geometry);
      }
      if (settings.trailStyle === "comet") {
        ctx.globalAlpha = sourceAlpha * opacity * 0.7;
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = settings.cursorColor;
        ctx.shadowBlur = 12 * unit;
        ctx.beginPath();
        ctx.arc(
          pointer.x * sourceW,
          pointer.y * sourceH,
          cursorSize * 0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
  if (pointer && pointer.visible !== false) {
    const nearClick = clicks.some((click) => click.age < 0.16);
    drawCursor(
      ctx,
      pointer.x * sourceW,
      pointer.y * sourceH,
      cursorSize * (nearClick ? 0.88 : 1),
      settings.cursorStyle,
      settings.cursorColor,
    );
  }
}

/** One rendering path is used by the editor and every exported frame. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  options: FrameOptions,
) {
  const { width, height, settings, zooms, pointers, video, isDemo } = options;
  const time = Math.max(0, options.time);
  if (!width || !height) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const backgroundKey = `${width}:${height}:${settings.background}:${settings.grain}`;
  let cached = backgroundCache.get(ctx);
  if (!cached || cached.key !== backgroundKey) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const backgroundContext = canvas.getContext("2d", { alpha: false });
    if (backgroundContext) {
      drawBackground(backgroundContext, width, height, settings);
      cached = { key: backgroundKey, canvas };
      backgroundCache.set(ctx, cached);
    }
  }
  if (cached?.key === backgroundKey) ctx.drawImage(cached.canvas, 0, 0);
  else drawBackground(ctx, width, height, settings);
  const sourceW = isDemo ? DEMO_WIDTH : video?.videoWidth || 1920;
  const sourceH = isDemo ? DEMO_HEIGHT : video?.videoHeight || 1080;
  const base = Math.min(width, height) / 720;
  const chrome = settings.cameraFrame === "none" ? 0 : 32 * base;
  const rect = getContentRect(width, height, settings, sourceW, sourceH);
  const frameW = rect.width;
  const contentH = rect.height;
  const frameH = contentH + chrome;
  const frameX = rect.x;
  const frameY = rect.y - chrome;
  const sourceFit = frameW / sourceW;
  const radius = settings.roundness * base;
  const intro =
    settings.intro === "none" ? 1 : ease(time / 0.8, settings.motion);

  ctx.save();
  // Entrance motion moves the complete window, including its shadow and cursor.
  if (settings.intro === "rise") {
    ctx.translate(0, (1 - intro) * height * 0.1);
    ctx.globalAlpha = intro;
  } else if (settings.intro === "swoop") {
    ctx.translate(width / 2, height / 2 + (1 - intro) * height * 0.12);
    ctx.rotate((1 - intro) * -0.035);
    ctx.scale(lerp(0.88, 1, intro), lerp(0.88, 1, intro));
    ctx.translate(-width / 2, -height / 2);
    ctx.globalAlpha = intro;
  } else if (settings.intro === "pop") {
    const scale = lerp(0.8, 1, intro);
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
    ctx.globalAlpha = intro;
  }
  ctx.shadowColor = `rgba(10, 30, 22, ${clamp(settings.shadow / 100) * 0.5})`;
  ctx.shadowBlur = settings.shadow * base * 0.8;
  ctx.shadowOffsetY = settings.shadow * base * 0.35;
  roundRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.clip();
  if (chrome) {
    ctx.fillStyle = "#fcfdfbeF";
    ctx.fillRect(frameX, frameY, frameW, chrome);
    ["#ed8479", "#e8c47b", "#96bc89"].forEach((color, i) => {
      ctx.beginPath();
      ctx.arc(
        frameX + (17 + i * 15) * base,
        frameY + chrome / 2,
        4 * base,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = color;
      ctx.fill();
    });
    if (settings.cameraFrame === "browser" && frameW > 200 * base) {
      const addressW = Math.min(frameW * 0.45, 320 * base);
      roundRect(
        ctx,
        frameX + (frameW - addressW) / 2,
        frameY + 6 * base,
        addressW,
        20 * base,
        5 * base,
      );
      ctx.fillStyle = "#edf0eb";
      ctx.fill();
      ctx.fillStyle = "#98a18f";
      ctx.textAlign = "center";
      ctx.font = `500 ${9 * base}px Inter, "Segoe UI", sans-serif`;
      ctx.fillText(
        isDemo ? "orbit.app / spring-launch" : "Your workspace",
        frameX + frameW / 2,
        frameY + 19 * base,
      );
      ctx.textAlign = "left";
    } else if (frameW > 160 * base) {
      ctx.fillStyle = "#a2ad9c";
      ctx.textAlign = "center";
      ctx.font = `500 ${9 * base}px Inter, "Segoe UI", sans-serif`;
      ctx.fillText(
        isDemo
          ? "Orbit · A little progress, every day"
          : "A moment worth sharing",
        frameX + frameW / 2,
        frameY + 19 * base,
      );
      ctx.textAlign = "left";
    }
  }
  const contentY = frameY + chrome;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frameX, contentY, frameW, contentH);
  ctx.clip();
  const camera = cameraAt(zooms, time, settings.motion);
  ctx.translate(frameX + frameW / 2, contentY + contentH / 2);
  ctx.scale(sourceFit * camera.scale, sourceFit * camera.scale);
  ctx.translate(-camera.x * sourceW, -camera.y * sourceH);
  if (isDemo) drawDemo(ctx, time);
  else if (video && video.readyState >= 2)
    ctx.drawImage(video, 0, 0, sourceW, sourceH);
  else {
    ctx.fillStyle = "#18251f";
    ctx.fillRect(0, 0, sourceW, sourceH);
    ctx.textAlign = "center";
    ctx.font = `500 ${sourceW / 55}px Inter, sans-serif`;
    ctx.fillStyle = "#b6c3b4";
    ctx.fillText(
      "Your next great screen story starts here.",
      sourceW / 2,
      sourceH / 2,
    );
    ctx.textAlign = "left";
  }
  drawPointerLayer(ctx, {
    width: sourceW,
    height: sourceH,
    time,
    settings,
    pointers,
  });
  ctx.restore();
  // Thin glass border belongs outside the clip to avoid a jagged upper edge.
  ctx.save();
  ctx.globalAlpha *= 0.65;
  roundRect(ctx, frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1, radius);
  ctx.strokeStyle = "#ffffff66";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
