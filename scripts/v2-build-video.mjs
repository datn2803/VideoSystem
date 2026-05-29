// Build final video by stitching 7 scenes:
// each scene = background image (Ken Burns) + voiceover + text overlays + branding chip
// Then concat all 7 scenes with crossfade.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG = path.join(ROOT, "assets/images");
const OVL = path.join(ROOT, "assets/overlays");
const AUD = path.join(ROOT, "assets/audio");
const SCN = path.join(ROOT, "assets/scenes");
const OUT = path.join(ROOT, "out");

fs.mkdirSync(SCN, { recursive: true });

const W = 1080, H = 1920, FPS = 30;
const BRANDING = path.join(OVL, "branding.png");
const audioMeta = JSON.parse(fs.readFileSync(path.join(AUD, "scene-durations.json"), "utf-8"));

// Scene config: bg image, voiceover, overlay list (with timing relative to scene start)
const SCENES = [
  {
    id: 1,
    bg: "01-vu-portrait.jpg",
    voice: "scene-01.mp3",
    overlays: [
      // top hook
      { png: "scene-01-a.png", in: 0.3, holdEnd: 4.2, fadeIn: 0.8, fadeOut: 0.5 },
      // red emphasis
      { png: "scene-01-b.png", in: 4.0, holdEnd: 9.0, fadeIn: 0.6, fadeOut: 0.4 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.08,
  },
  {
    id: 2,
    bg: "02-laptop-charts.jpg",
    voice: "scene-02.mp3",
    overlays: [
      { png: "scene-02-a.png", in: 1.0, holdEnd: 15.0, fadeIn: 1.0, fadeOut: 0.5 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.05,
  },
  {
    id: 3,
    bg: "03-credit-cards.jpg",
    voice: "scene-03.mp3",
    overlays: [
      { png: "scene-03-a.png", in: 0.5, holdEnd: 3.5, fadeIn: 0.5, fadeOut: 0.4 },
      { png: "scene-03-b.png", in: 3.5, holdEnd: 19.5, fadeIn: 0.8, fadeOut: 0.5 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.08,
  },
  {
    id: 4,
    bg: "05-house-handshake.jpg",
    voice: "scene-04.mp3",
    overlays: [
      { png: "scene-04-a.png", in: 0.5, holdEnd: 3.5, fadeIn: 0.5, fadeOut: 0.4 },
      { png: "scene-04-b.png", in: 3.5, holdEnd: 17.5, fadeIn: 0.8, fadeOut: 0.5 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.05,
  },
  {
    id: 5,
    bg: "07-savings-growth.jpg",
    voice: "scene-05.mp3",
    overlays: [
      { png: "scene-05-a.png", in: 0.5, holdEnd: 3.5, fadeIn: 0.5, fadeOut: 0.4 },
      { png: "scene-05-b.png", in: 3.5, holdEnd: 17.5, fadeIn: 0.8, fadeOut: 0.5 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.06,
  },
  {
    id: 6,
    bg: "01-vu-portrait.jpg",
    voice: "scene-06.mp3",
    overlays: [
      { png: "scene-06-a.png", in: 0.5, holdEnd: 9.5, fadeIn: 0.6, fadeOut: 0.3 },
    ],
    kbZoomFrom: 1.0, kbZoomTo: 1.04,
  },
  {
    id: 7,
    bg: "01-vu-portrait.jpg",
    voice: "scene-07.mp3",
    overlays: [
      { png: "scene-07-a.png", in: 0.3, holdEnd: 11.0, fadeIn: 0.6, fadeOut: 0.3 },
    ],
    kbZoomFrom: 1.05, kbZoomTo: 1.0,
  },
];

function sceneDuration(id) {
  return audioMeta.find((m) => m.id === id).durationSec + 0.3; // small tail
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function buildScene(scene) {
  const dur = sceneDuration(scene.id);
  const outFile = path.join(SCN, `scene-${String(scene.id).padStart(2, "0")}.mp4`);

  // Build inputs:
  // [0] bg image (loop)
  // [1..N] overlay PNGs (loop)
  // [N+1] branding PNG (loop)
  // [N+2] voiceover MP3
  const inputs = [];
  inputs.push("-loop", "1", "-t", dur.toFixed(3), "-i", path.join(IMG, scene.bg));
  for (const ov of scene.overlays) {
    inputs.push("-loop", "1", "-t", dur.toFixed(3), "-i", path.join(OVL, ov.png));
  }
  inputs.push("-loop", "1", "-t", dur.toFixed(3), "-i", BRANDING);
  inputs.push("-i", path.join(AUD, scene.voice));

  // Build filter complex
  // [0:v] scale + crop + Ken Burns zoompan
  const totalFrames = Math.round(dur * FPS);
  const zoomDelta = scene.kbZoomTo - scene.kbZoomFrom;
  // zoompan z='zoom_from+delta*on/total_frames' progressive
  const kbExpr = `'${scene.kbZoomFrom}+${zoomDelta}*on/${totalFrames}'`;

  const parts = [];
  parts.push(
    `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
      `zoompan=z=${kbExpr}:d=1:s=${W}x${H}:fps=${FPS}[bg]`
  );

  // Layer overlays with fade in/out
  let lastLabel = "bg";
  scene.overlays.forEach((ov, i) => {
    const idx = i + 1; // input index
    const fadeOutStart = ov.holdEnd;
    parts.push(
      `[${idx}:v]format=rgba,` +
        `fade=t=in:st=${ov.in}:d=${ov.fadeIn}:alpha=1,` +
        `fade=t=out:st=${fadeOutStart}:d=${ov.fadeOut}:alpha=1` +
        `[ov${idx}]`
    );
    const nextLabel = `v${idx}`;
    parts.push(
      `[${lastLabel}][ov${idx}]overlay=0:0:enable='between(t,${ov.in},${(ov.holdEnd + ov.fadeOut).toFixed(2)})'[${nextLabel}]`
    );
    lastLabel = nextLabel;
  });

  // Branding (always on)
  const brandIdx = scene.overlays.length + 1;
  parts.push(`[${brandIdx}:v]format=rgba[brand]`);
  parts.push(`[${lastLabel}][brand]overlay=0:0[vout]`);

  const filterComplex = parts.join(";");

  const audioIdx = scene.overlays.length + 2;
  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", `${audioIdx}:a`,
    "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-shortest",
    "-movflags", "+faststart",
    outFile,
  ];

  await runFFmpeg(args);
  const stats = fs.statSync(outFile);
  return { outFile, size: stats.size, duration: dur };
}

async function concatScenes(sceneFiles, finalOut) {
  // Concat with crossfade — use xfade filter chain
  // Simpler approach: use concat demuxer (no crossfade)
  // For crossfade, build chain:
  // [0:v]...[1:v]xfade=offset=...:duration=0.5[v01]; [v01][2:v]xfade=...
  // This requires knowing exact durations.

  // For first pass, just use concat demuxer (clean cuts). Crossfade is v2.
  const listPath = path.join(SCN, "concat.txt");
  fs.writeFileSync(
    listPath,
    sceneFiles.map((f) => `file '${f}'`).join("\n") + "\n"
  );

  await runFFmpeg([
    "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-c", "copy",
    "-movflags", "+faststart",
    finalOut,
  ]);
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  console.log(`🎬 Building ${SCENES.length} scenes...\n`);

  const built = [];
  for (const scene of SCENES) {
    const dur = sceneDuration(scene.id);
    process.stdout.write(`▶ Scene ${scene.id} (${dur.toFixed(2)}s)... `);
    const t0 = Date.now();
    const r = await buildScene(scene);
    built.push(r);
    console.log(`✅ ${(r.size / 1024 / 1024).toFixed(2)}MB (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const finalPath = path.join(OUT, `vu-case-200tr-6ty-v2-${ts}.mp4`);
  process.stdout.write(`\n▶ Concat ${SCENES.length} scenes → final... `);
  const t0 = Date.now();
  await concatScenes(built.map((b) => b.outFile), finalPath);
  console.log(`✅ ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const stats = fs.statSync(finalPath);
  console.log(`\n🎬 FINAL: ${finalPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  const total = built.reduce((s, b) => s + b.duration, 0);
  console.log(`   Duration: ${total.toFixed(2)}s (~${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")})`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
