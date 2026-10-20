import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = path.join(root, "artifacts", "effects-v02");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const checks = [];
const screenshots = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.location().url.includes("favicon"))
    errors.push(`${message.text()} (${message.location().url})`);
});

try {
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  await page.goto("http://127.0.0.1:9347", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    window.proofStudio = await import("/src/studio/index.ts");
    const canvas = document.createElement("canvas");
    canvas.id = "effects-proof";
    canvas.width = 1280;
    canvas.height = 720;
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      width: "1280px",
      height: "720px",
    });
    document.body.append(canvas);
    window.proofCanvas = canvas;
    window.proofImages = [];
    window.proofPointer = [
      { t: 0, x: 0.13, y: 0.72 },
      { t: 0.4, x: 0.28, y: 0.48 },
      { t: 0.8, x: 0.46, y: 0.34 },
      { t: 1.2, x: 0.7, y: 0.48 },
      { t: 1.6, x: 0.85, y: 0.32 },
    ];
    window.proofDrag = [
      { t: 0, x: 0.18, y: 0.68, pressed: false },
      { t: 1, x: 0.18, y: 0.68, event: "down", pressed: true, click: true },
      { t: 1.3, x: 0.36, y: 0.35, event: "move", pressed: true },
      { t: 1.6, x: 0.6, y: 0.3, event: "move", pressed: true },
      { t: 1.8, x: 0.8, y: 0.55, event: "move", pressed: true },
      { t: 2, x: 0.8, y: 0.55, event: "up", pressed: false },
    ];
    window.paintProof = (config) => {
      const studio = window.proofStudio;
      const canvas = window.proofCanvas;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f8faf7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#213d34";
      ctx.font = "600 25px Segoe UI, sans-serif";
      ctx.fillText(config.title, 64, 68);
      ctx.fillStyle = "#718178";
      ctx.font = "16px Segoe UI, sans-serif";
      ctx.fillText(
        "Swoop Studio · shared preview / export pointer engine · 1280 × 720",
        64,
        98,
      );
      ctx.strokeStyle = "#e6ebe6";
      ctx.lineWidth = 1;
      for (let x = 64; x < 1250; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 140);
        ctx.lineTo(x, 660);
        ctx.stroke();
      }
      for (let y = 140; y < 670; y += 64) {
        ctx.beginPath();
        ctx.moveTo(64, y);
        ctx.lineTo(1216, y);
        ctx.stroke();
      }
      const settings = {
        ...studio.DEFAULT_SETTINGS,
        intro: "none",
        cursorTrail: false,
        clickRipple: false,
        dragEffect: false,
        smoothing: 0,
        ...config.settings,
      };
      studio.drawPointerLayer(ctx, {
        width: canvas.width,
        height: canvas.height,
        time: config.time ?? 1.2,
        pointers: config.pointers ?? window.proofPointer,
        settings,
      });
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    window.diffProof = (first, second, exclude) => {
      let visiblePixels = 0;
      let changedPixels = 0;
      let maxDifference = 0;
      for (let i = 0; i < first.length; i += 4) {
        const x = (i / 4) % 1280;
        const y = Math.floor(i / 4 / 1280);
        if (
          exclude &&
          Math.hypot(x - exclude.x, y - exclude.y) < exclude.radius
        )
          continue;
        const delta =
          Math.abs(first[i] - second[i]) +
          Math.abs(first[i + 1] - second[i + 1]) +
          Math.abs(first[i + 2] - second[i + 2]);
        if (delta) changedPixels++;
        if (delta >= 24) visiblePixels++;
        maxDifference = Math.max(maxDifference, delta);
      }
      return { changedPixels, visiblePixels, maxDifference };
    };
  });

  async function prove(name, title, settings, options = {}) {
    const result = await page.evaluate(
      ({ title, settings, options }) => {
        const pointers = options.drag
          ? window.proofDrag
          : options.click
            ? [
                {
                  t: 1,
                  x: 0.53,
                  y: 0.48,
                  event: "down",
                  pressed: true,
                  click: true,
                },
              ]
            : options.cursor
              ? [{ t: 0, x: 0.5, y: 0.45 }]
              : window.proofPointer;
        const time = options.drag ? 1.75 : options.click ? 1.15 : 1.2;
        const beforeSettings = options.cursor
          ? { ...settings, showCursor: false }
          : {
              ...settings,
              cursorTrail: false,
              clickRipple: false,
              dragEffect: false,
            };
        const before = window.paintProof({
          title,
          settings: beforeSettings,
          time,
          pointers,
        });
        const after = window.paintProof({ title, settings, time, pointers });
        const head = window.proofStudio.samplePointer(pointers, time, 0);
        const diff = window.diffProof(
          before,
          after,
          options.trail
            ? { x: head.x * 1280, y: head.y * 720, radius: 56 }
            : undefined,
        );
        window.proofImages.push({
          title,
          data: window.proofCanvas.toDataURL(),
        });
        return diff;
      },
      { title, settings, options },
    );
    const required = options.trail ? 300 : options.click ? 80 : 180;
    if (result.visiblePixels < required || result.maxDifference < 40)
      throw new Error(
        `${name}: effect not visibly rendered: ${JSON.stringify(result)}`,
      );
    checks.push({ name, ...result, requiredVisiblePixels: required });
    const filename = `${name}.png`;
    await page
      .locator("#effects-proof")
      .screenshot({ path: path.join(output, filename) });
    screenshots.push(filename);
  }

  for (const style of ["ribbon", "comet", "ghost"])
    await prove(
      `trail-${style}`,
      `${style[0].toUpperCase() + style.slice(1)} trail · 600 ms · 80% strength`,
      {
        cursorTrail: true,
        trailStyle: style,
        trailDuration: 0.6,
        trailOpacity: 80,
      },
      { trail: true },
    );
  for (const style of ["presenter", "outline", "neon", "spotlight"])
    await prove(
      `cursor-${style}`,
      `${style[0].toUpperCase() + style.slice(1)} cursor`,
      {
        cursorStyle: style,
        cursorSize: 72,
        cursorColor: style === "neon" ? "#56dcd5" : "#ffffff",
      },
      { cursor: true },
    );
  for (const style of ["ripple", "pulse", "burst", "ring"])
    await prove(
      `click-${style}`,
      `${style[0].toUpperCase() + style.slice(1)} click · 150 ms after mouse down`,
      {
        clickRipple: true,
        clickStyle: style,
        clickColor: "#d47a3b",
        clickSize: 120,
      },
      { click: true },
    );
  for (const style of ["elastic", "path", "selection"])
    await prove(
      `drag-${style}`,
      `${style[0].toUpperCase() + style.slice(1)} drag · real press / release history`,
      { dragEffect: true, dragStyle: style, dragColor: "#429c85" },
      { drag: true },
    );

  const integration = await page.evaluate(() => {
    const {
      renderFrame,
      DEFAULT_SETTINGS,
      DEMO_POINTERS,
      DEMO_ZOOMS,
      DEMO_DURATION,
    } = window.proofStudio;
    const ctx = window.proofCanvas.getContext("2d");
    const settings = {
      ...DEFAULT_SETTINGS,
      intro: "none",
      cursorStyle: "presenter",
      cursorTrail: true,
      trailStyle: "ribbon",
      trailDuration: 0.6,
      trailOpacity: 80,
      clickStyle: "burst",
      clickColor: "#d47a3b",
      clickSize: 100,
      dragEffect: true,
      dragStyle: "elastic",
      dragColor: "#429c85",
    };
    const config = {
      width: 1280,
      height: 720,
      time: 7.4,
      duration: DEMO_DURATION,
      settings,
      zooms: DEMO_ZOOMS,
      pointers: DEMO_POINTERS,
      isDemo: true,
    };
    renderFrame(ctx, {
      ...config,
      settings: {
        ...settings,
        cursorTrail: false,
        clickRipple: false,
        dragEffect: false,
      },
    });
    const before = ctx.getImageData(0, 0, 1280, 720).data;
    renderFrame(ctx, config);
    const after = ctx.getImageData(0, 0, 1280, 720).data;
    const visible = window.diffProof(before, after);
    renderFrame(ctx, { ...config, time: 2.2 });
    renderFrame(ctx, config);
    const seeked = ctx.getImageData(0, 0, 1280, 720).data;
    const seekDiff = window.diffProof(after, seeked);
    window.proofExportSettings = settings;
    return {
      visible,
      seekDiff,
      demoDownEvents: DEMO_POINTERS.filter((p) => p.event === "down").length,
      demoUpEvents: DEMO_POINTERS.filter((p) => p.event === "up").length,
    };
  });
  if (integration.visible.visiblePixels < 150)
    throw new Error(
      `renderFrame did not render effects: ${JSON.stringify(integration)}`,
    );
  if (integration.seekDiff.changedPixels !== 0)
    throw new Error(
      `Backwards seek was not pixel deterministic: ${JSON.stringify(integration.seekDiff)}`,
    );
  checks.push({
    name: "renderFrame integration + deterministic backwards seek",
    ...integration,
  });
  await page
    .locator("#effects-proof")
    .screenshot({ path: path.join(output, "combined-demo-720p.png") });
  screenshots.push("combined-demo-720p.png");

  const base64 = await page.evaluate(async () => {
    const studio = window.proofStudio;
    const blob = await studio.exportVideo({
      isDemo: true,
      duration: studio.DEMO_DURATION,
      trimStart: 7.05,
      trimEnd: 7.65,
      settings: window.proofExportSettings,
      zooms: studio.DEMO_ZOOMS,
      pointers: studio.DEMO_POINTERS,
      width: 1280,
      fps: 30,
    });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(";base64,")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
  const videoPath = path.join(output, "cursor-effects-demo.webm");
  await fs.writeFile(videoPath, Buffer.from(base64, "base64"));
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,nb_read_frames:format=duration,size",
      "-of",
      "json",
      videoPath,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr}`);
  const media = JSON.parse(probe.stdout);
  const stream = media.streams[0];
  if (
    stream.width !== 1280 ||
    stream.height !== 720 ||
    Number(stream.nb_read_frames) < 10 ||
    Number(media.format.duration) < 0.5 ||
    Number(media.format.duration) > 1.5
  )
    throw new Error(`Unexpected exported media: ${JSON.stringify(media)}`);
  const decode = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", videoPath, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  if (decode.status !== 0 || decode.stderr.trim())
    throw new Error(`Export decode failed: ${decode.stderr}`);
  const contact = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      "select='eq(n,3)+eq(n,9)+eq(n,15)',scale=480:-1,tile=3x1",
      "-frames:v",
      "1",
      "-update",
      "1",
      "-y",
      path.join(output, "encoded-contact-sheet.png"),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (contact.status !== 0 || contact.stderr.trim())
    throw new Error(`Encoded frame contact sheet failed: ${contact.stderr}`);
  screenshots.push("encoded-contact-sheet.png");
  checks.push({
    name: "shared exportVideo + ffprobe + full decode",
    file: "cursor-effects-demo.webm",
    ...media,
    decodeErrors: decode.stderr.trim(),
  });

  await page.evaluate(async () => {
    const source = window.proofImages;
    const canvas = window.proofCanvas;
    canvas.width = 1280;
    canvas.height = Math.ceil(source.length / 4) * 210;
    canvas.style.height = `${canvas.height}px`;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e3e9e2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < source.length; i++) {
      const image = new Image();
      image.src = source[i].data;
      await image.decode();
      const x = (i % 4) * 320;
      const y = Math.floor(i / 4) * 210;
      ctx.drawImage(image, x + 5, y + 5, 310, 174.375);
      ctx.fillStyle = "#213d34";
      ctx.font = "500 12px Segoe UI, sans-serif";
      ctx.fillText(source[i].title.split(" · ")[0], x + 12, y + 198);
    }
  });
  await page
    .locator("#effects-proof")
    .screenshot({ path: path.join(output, "effects-contact-sheet.png") });
  screenshots.push("effects-contact-sheet.png");
  if (errors.length) throw new Error(`Runtime errors: ${errors.join("; ")}`);
  const result = {
    passed: true,
    checkedAt: new Date().toISOString(),
    cases: checks.length,
    coverage: {
      trailStyles: 3,
      newCursorStyles: 4,
      clickStyles: 4,
      dragStyles: 3,
      integrationAndSeek: 1,
      sharedExporter: 1,
    },
    checks,
    screenshots,
    runtimeErrors: errors,
  };
  await fs.writeFile(
    path.join(output, "proof-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page
    .screenshot({ path: path.join(output, "failure.png") })
    .catch(() => {});
  await fs.writeFile(
    path.join(output, "proof-results.json"),
    JSON.stringify(
      {
        passed: false,
        checks,
        screenshots,
        runtimeErrors: errors,
        error: String(error),
      },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
