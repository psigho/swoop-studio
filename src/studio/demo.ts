import type { PointerSample, ZoomRegion } from "./types";
import { clamp, smoothstep } from "./motion";

export const DEMO_DURATION = 12;
const DEMO_KEYFRAMES: PointerSample[] = [
  { t: 0, x: 0.72, y: 0.68 },
  { t: 0.65, x: 0.67, y: 0.59 },
  { t: 1.25, x: 0.31, y: 0.63 },
  { t: 1.95, x: 0.213, y: 0.646 },
  {
    t: 2.2,
    x: 0.213,
    y: 0.646,
    event: "down",
    pressed: true,
    button: 1,
    click: true,
  },
  { t: 2.32, x: 0.213, y: 0.646, event: "up", pressed: false, button: 1 },
  { t: 2.85, x: 0.22, y: 0.646 },
  { t: 3.6, x: 0.48, y: 0.66 },
  { t: 4.4, x: 0.64, y: 0.77 },
  {
    t: 4.9,
    x: 0.66,
    y: 0.775,
    event: "down",
    pressed: true,
    button: 1,
    click: true,
  },
  { t: 5.02, x: 0.66, y: 0.775, event: "up", pressed: false, button: 1 },
  { t: 5.8, x: 0.67, y: 0.775 },
  { t: 6.7, x: 0.78, y: 0.37 },
  {
    t: 7.05,
    x: 0.78,
    y: 0.37,
    event: "down",
    pressed: true,
    button: 1,
    click: true,
  },
  { t: 7.22, x: 0.79, y: 0.31, pressed: true, button: 1 },
  { t: 7.4, x: 0.835, y: 0.235, pressed: true, button: 1 },
  { t: 7.5, x: 0.895, y: 0.182, pressed: true, button: 1 },
  { t: 7.65, x: 0.895, y: 0.182, event: "up", pressed: false, button: 1 },
  {
    t: 7.9,
    x: 0.895,
    y: 0.182,
    event: "down",
    pressed: true,
    button: 1,
    click: true,
  },
  { t: 8.03, x: 0.895, y: 0.182, event: "up", pressed: false, button: 1 },
  { t: 8.6, x: 0.89, y: 0.19 },
  { t: 9.6, x: 0.81, y: 0.45 },
  { t: 10.7, x: 0.69, y: 0.59 },
  { t: 12, x: 0.68, y: 0.59 },
];
// Dense samples match real capture and make every trail style visible in the
// built-in project. Preserve exact event times while filling the gaps at 60 Hz.
export const DEMO_POINTERS: PointerSample[] = DEMO_KEYFRAMES.flatMap(
  (keyframe, index) => {
    const pressed = keyframe.pressed === true;
    const first: PointerSample = {
      ...keyframe,
      event: keyframe.event ?? "move",
      pressed,
      ...(pressed ? { button: 1 } : {}),
    };
    const next = DEMO_KEYFRAMES[index + 1];
    if (!next) return [first];
    const samples: PointerSample[] = [first];
    for (let frame = 1; keyframe.t + frame / 60 < next.t - 0.0001; frame++) {
      const t = Math.round((keyframe.t + frame / 60) * 1000000) / 1000000;
      const fraction = (t - keyframe.t) / (next.t - keyframe.t);
      samples.push({
        t,
        x: keyframe.x + (next.x - keyframe.x) * fraction,
        y: keyframe.y + (next.y - keyframe.y) * fraction,
        event: "move",
        pressed,
        ...(pressed ? { button: 1 } : {}),
      });
    }
    return samples;
  },
);
export const DEMO_ZOOMS: ZoomRegion[] = [
  { id: "demo-focus", start: 0.7, end: 3.65, x: 0.34, y: 0.62, scale: 1.65 },
  { id: "demo-review", start: 4.1, end: 6.85, x: 0.61, y: 0.66, scale: 1.6 },
  {
    id: "demo-celebrate",
    start: 7.15,
    end: 10.3,
    x: 0.82,
    y: 0.25,
    scale: 1.65,
  },
];
export const DEMO_WIDTH = 1440;
export const DEMO_HEIGHT = 900;

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 12,
  fill = "#ffffff",
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 18,
  color = "#253c33",
  weight = 500,
) {
  ctx.font = `${weight} ${size}px Inter, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#e8ece7",
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function tick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = "#fff",
  size = 7,
) {
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x - size / 4, y + size / 1.7);
  ctx.lineTo(x + size, y - size / 1.8);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.stroke();
}
function pill(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string,
  textColor = "#456357",
) {
  ctx.font = '600 13px Inter, "Segoe UI", sans-serif';
  const width = ctx.measureText(value).width + 24;
  box(ctx, x, y - 18, width, 28, 7, color);
  label(ctx, value, x + 12, y + 1, 13, textColor, 600);
  return width;
}
function avatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  fill: string,
) {
  circle(ctx, x, y, 15, "#ffffff");
  circle(ctx, x, y, 13, fill);
  ctx.textAlign = "center";
  label(ctx, name, x, y + 4, 10, "#344c40", 700);
  ctx.textAlign = "left";
}

/** Original sample project, drawn locally and deterministically. No screenshots or remote assets. */
export function drawDemo(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.fillStyle = "#f5f6f2";
  ctx.fillRect(0, 0, DEMO_WIDTH, DEMO_HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 236, 900);
  line(ctx, 236, 0, 236, 900);
  circle(ctx, 40, 43, 15, "#224d3d");
  ctx.strokeStyle = "#c8f1b5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(40, 43, 11, 5, -0.65, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, 49, 38, 2.5, "#c8f1b5");
  label(ctx, "orbit", 65, 51, 28, "#214636", 700);
  label(ctx, "WORKSPACE", 27, 115, 11, "#8c9890", 700);
  box(ctx, 17, 130, 202, 44, 9, "#eaf0e8");
  label(ctx, "▦", 33, 158, 20, "#27523b", 600);
  label(ctx, "Overview", 65, 157, 15, "#27523b", 650);
  const nav = [
    ["My tasks", "12"],
    ["Projects", "4"],
    ["Messages", "3"],
    ["Calendar", ""],
  ];
  nav.forEach(([name, count], i) => {
    box(ctx, 34, 193 + i * 47, 14, 14, 4, "#fff", "#acb5ad");
    label(ctx, name, 65, 206 + i * 47, 15, "#6d7a70");
    if (count) {
      box(ctx, 181, 188 + i * 47, 24, 23, 5, "#f2f4ef");
      label(ctx, count, 187, 205 + i * 47, 11, "#7d887e");
    }
  });
  label(ctx, "YOUR PROJECTS", 27, 427, 11, "#8c9890", 700);
  [
    ["Spring launch", "#6e9470"],
    ["Website refresh", "#c1a276"],
    ["Studio experiments", "#9d92b3"],
  ].forEach(([name, fill], i) => {
    circle(ctx, 40, 464 + i * 40, 4, fill);
    label(ctx, name, 58, 469 + i * 40, 14, "#6a786d");
  });
  box(ctx, 18, 691, 199, 113, 12, "#f2f5ee");
  label(ctx, "Room for good ideas.", 32, 717, 14, "#3d5948", 650);
  label(ctx, "Bring your people together.", 32, 741, 11, "#8a9689");
  box(ctx, 32, 759, 170, 30, 6, "#fff", "#e0e7da");
  ctx.textAlign = "center";
  label(ctx, "+  Invite a teammate", 117, 779, 11, "#4c6956", 600);
  ctx.textAlign = "left";
  avatar(ctx, 39, 850, "JS", "#dae9ca");
  label(ctx, "Junaid’s workspace", 62, 847, 13, "#4e6253", 650);
  label(ctx, "Personal space", 62, 865, 11, "#9aA599");

  ctx.fillStyle = "#fff";
  ctx.fillRect(237, 0, 1203, 81);
  line(ctx, 236, 81, 1440, 81);
  label(ctx, "Workspace", 278, 48, 14, "#7f8d81");
  label(ctx, "/", 375, 48, 14, "#bdc4bb");
  label(ctx, "Spring launch", 397, 48, 14, "#3c5543", 650);
  box(ctx, 1096, 23, 194, 34, 8, "#f6f7f4");
  label(ctx, "⌕  Search anything", 1110, 45, 12, "#9aa497");
  avatar(ctx, 1330, 41, "JS", "#d5e5c5");
  label(ctx, "MONDAY, 14 APRIL", 278, 126, 11, "#8f9c90", 650);
  label(ctx, "Make room for the good work.", 277, 170, 34, "#263f30", 650);
  label(
    ctx,
    "Your next big thing, one small step at a time.",
    279,
    202,
    15,
    "#879381",
  );
  const published = time >= 7.9;
  box(ctx, 1210, 140, 176, 43, 10, published ? "#2f6149" : "#355d45");
  if (published) tick(ctx, 1229, 162, "#dff5cc", 5);
  else label(ctx, "+", 1225, 169, 24, "#dff5cc");
  label(
    ctx,
    published ? "Launch is live" : "Publish launch",
    1248,
    167,
    13,
    "#f0f5ec",
    650,
  );

  // A project progress banner supplies a playful, distinctive focal point.
  box(ctx, 279, 230, 1107, 112, 13, "#e4eddc");
  label(ctx, "SPRING LAUNCH / 2026", 302, 260, 10, "#71886b", 700);
  label(
    ctx,
    published
      ? "From good idea to out in the world."
      : "Good ideas deserve a great launch.",
    301,
    292,
    24,
    "#365532",
    650,
  );
  label(
    ctx,
    published
      ? "Your team made something worth sharing."
      : "A little focus. A little teamwork. A lot of possibility.",
    302,
    318,
    12,
    "#82947a",
  );
  // Leaf/planet mark, an original canvas illustration.
  ctx.save();
  ctx.translate(1277, 285);
  ctx.rotate(-0.3);
  ctx.strokeStyle = "#acbf98";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 13 + Math.abs(i) * 5, i * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }
  circle(ctx, 35, -40, 6, "#93b079");
  ctx.restore();

  label(ctx, "Launch board", 279, 384, 20, "#3c5140", 650);
  pill(ctx, "12 tasks", 425, 379, "#ecefe7", "#8a9583");
  label(ctx, "Board", 1152, 381, 13, "#4d674f", 650);
  label(ctx, "List", 1228, 381, 13, "#9aa793");
  label(ctx, "Filter  ⌄", 1304, 381, 13, "#9aa793");
  line(ctx, 279, 402, 1386, 402);
  const columns = [
    { x: 279, title: "In progress", dot: "#cca763", count: "4" },
    { x: 657, title: "In review", dot: "#a69abb", count: "3" },
    {
      x: 1035,
      title: "Ready to ship",
      dot: "#8ca783",
      count: published ? "6" : "5",
    },
  ];
  columns.forEach(({ x, title, dot, count }) => {
    circle(ctx, x + 7, 433, 4, dot);
    label(ctx, title, x + 22, 438, 13, "#5f725d", 650);
    label(ctx, count, x + 134, 438, 11, "#9caa94");
    label(ctx, "+", x + 330, 440, 20, "#9eac97");
  });

  box(ctx, 279, 457, 351, 208, 11, "#ffffff", "#e2e7dc");
  pill(ctx, "DESIGN", 298, 487, "#edf0e4", "#84916b");
  label(ctx, "A homepage with a little soul", 298, 526, 15, "#3d5140", 650);
  label(ctx, "Create something they remember.", 298, 550, 12, "#9aa492");
  const done = time >= 2.2;
  box(
    ctx,
    298,
    573,
    17,
    17,
    5,
    done ? "#547b4e" : "#fff",
    done ? undefined : "#cbd6c2",
  );
  if (done) tick(ctx, 307, 582, "#fff", 4);
  label(
    ctx,
    done ? "First draft, feeling good" : "Finish the first draft",
    325,
    586,
    12,
    done ? "#5b7b51" : "#85917c",
  );
  line(ctx, 298, 606, 611, 606);
  avatar(ctx, 311, 636, "AM", "#e9d8c1");
  avatar(ctx, 333, 636, "JS", "#d9e8cb");
  label(ctx, "◷  Today", 533, 641, 11, "#a2ad99");
  box(ctx, 279, 682, 351, 132, 11, "#ffffff", "#e2e7dc");
  pill(ctx, "CONTENT", 298, 711, "#f4ebdf", "#ad9777");
  label(ctx, "Words that sound like us", 298, 750, 15, "#3d5140", 650);
  label(ctx, "Keep it human. Keep it simple.", 298, 774, 12, "#99a28f");
  avatar(ctx, 599, 786, "SK", "#e2dce9");

  box(ctx, 657, 457, 351, 265, 11, "#ffffff", "#e2e7dc");
  // Editorial thumbnail.
  box(ctx, 669, 469, 327, 109, 7, "#2d4434");
  label(ctx, "less, but", 688, 502, 20, "#e7edda", 500);
  label(ctx, "a little better.", 688, 530, 20, "#e7edda", 500);
  label(ctx, "THE SPRING COLLECTION", 689, 559, 8, "#9eaf91", 700);
  ctx.strokeStyle = "#99af7c";
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(928, 523, 28, 43, i * 0.43, 0, Math.PI * 2);
    ctx.stroke();
  }
  pill(ctx, "BRAND", 676, 611, "#eee9f4", "#9f8fae");
  label(
    ctx,
    time >= 4.9
      ? "Brand direction, approved ✓"
      : "A fresh direction for spring",
    676,
    648,
    15,
    "#3d5140",
    650,
  );
  label(ctx, "The details make the difference.", 676, 672, 12, "#99a28f");
  avatar(ctx, 689, 696, "JS", "#d9e8cb");
  label(
    ctx,
    time >= 4.9 ? "Approved" : "2 comments",
    906,
    700,
    11,
    time >= 4.9 ? "#64835a" : "#a2ad99",
  );
  box(ctx, 657, 739, 351, 93, 11, "#ffffff", "#e2e7dc");
  label(ctx, "A tiny celebration playlist", 676, 773, 15, "#3d5140", 650);
  label(ctx, "Good work needs a soundtrack.", 676, 799, 12, "#99a28f");

  box(ctx, 1035, 457, 351, 163, 11, "#ffffff", "#e2e7dc");
  pill(ctx, "STRATEGY", 1054, 487, "#e6f0df", "#7b986e");
  label(ctx, "Set the story in motion", 1054, 526, 15, "#3d5140", 650);
  label(ctx, "The plan is ready. So are we.", 1054, 550, 12, "#99a28f");
  avatar(ctx, 1067, 592, "AM", "#e9d8c1");
  circle(ctx, 1359, 590, 10, "#edf4e5");
  tick(ctx, 1359, 590, "#7d9b69", 4);
  box(ctx, 1035, 637, 351, 163, 11, "#ffffff", "#e2e7dc");
  pill(ctx, "PRODUCT", 1054, 668, "#e8eee9", "#799383");
  label(ctx, "Make the first hello count", 1054, 707, 15, "#3d5140", 650);
  label(ctx, "A thoughtful welcome, from day one.", 1054, 731, 12, "#99a28f");
  avatar(ctx, 1067, 771, "SK", "#e2dce9");
  circle(ctx, 1359, 770, 10, "#edf4e5");
  tick(ctx, 1359, 770, "#7d9b69", 4);
  label(ctx, "+  Add a task", 1053, 830, 12, "#a5af9b");
  label(ctx, "A little progress, every day.", 279, 870, 11, "#a8b09f");

  if (published) {
    const p = smoothstep((time - 7.9) / 0.42);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(0, (1 - p) * -15);
    ctx.shadowColor = "#153c2420";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    box(ctx, 1052, 89, 336, 61, 11, "#fff");
    ctx.shadowColor = "transparent";
    circle(ctx, 1081, 119, 13, "#e1efd8");
    tick(ctx, 1081, 119, "#638b50", 5);
    label(
      ctx,
      "And just like that, you’re live.",
      1104,
      115,
      13,
      "#496240",
      650,
    );
    label(ctx, "Here’s to making good things.", 1104, 134, 10, "#9aa58e");
    ctx.restore();
    const burst = clamp((time - 7.9) / 1.5);
    if (burst < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - burst) * 0.8;
      for (let i = 0; i < 24; i++) {
        const angle = i * 2.39996;
        const radius = (38 + i * 4) * Math.sin(burst * Math.PI * 0.7);
        circle(
          ctx,
          1290 + Math.cos(angle) * radius,
          164 + Math.sin(angle) * radius + burst * burst * 90,
          2 + (i % 3),
          ["#a4c487", "#d6bb88", "#c7b6d9"][i % 3],
        );
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
