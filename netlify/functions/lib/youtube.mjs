import { getStore } from "@netlify/blobs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export function youtubeConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

export function buildAuthUrl(redirectUri, state) {
  const url = new URL(OAUTH_BASE);
  url.searchParams.set("client_id", process.env.YOUTUBE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function getStoredTokens() {
  const store = getStore("youtube-auth");
  return store.get("tokens", { type: "json" });
}

export async function exchangeAndStore(params) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`YouTube token exchange failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const store = getStore("youtube-auth");
  const prev = await store.get("tokens", { type: "json" });
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev?.refresh_token || null,
    access_expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await store.setJSON("tokens", tokens);
  return tokens;
}

async function getAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens?.access_token) throw new Error("YouTube not connected — open /api/youtube-connect first");
  if (tokens.access_expires_at - Date.now() < 5 * 60 * 1000) {
    if (!tokens.refresh_token) throw new Error("YouTube access token expired and no refresh token stored — reconnect via /api/youtube-connect");
    console.log("[youtube] refreshing access token");
    tokens = await exchangeAndStore({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  }
  return tokens.access_token;
}

// Builds a single 1080x1920 (9:16) branded still frame: product photo centered
// on a warm background, matching the site's palette. No text is burned into
// the frame — ad copy goes in the video title/description instead, which
// keeps this step free of font-availability risk in the Lambda runtime.
async function buildFrame(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch product image (status ${res.status})`);
  const productImage = Buffer.from(await res.arrayBuffer());

  const CANVAS = { width: 1080, height: 1920 };
  const resizedProduct = await sharp(productImage)
    .resize(960, 1200, { fit: "contain", background: { r: 250, g: 246, b: 240, alpha: 1 } })
    .toBuffer();

  const frame = await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 3,
      background: { r: 250, g: 246, b: 240 },
    },
  })
    .composite([{ input: resizedProduct, gravity: "center" }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return frame;
}

// Renders a ~12s vertical video with a slow zoom on the still frame.
async function renderVideo(framePath, outPath, seconds = 12, fps = 24) {
  await chmod(ffmpegPath, 0o755).catch(() => {});
  const totalFrames = seconds * fps;
  const args = [
    "-y",
    "-loop", "1",
    "-i", framePath,
    "-vf", `zoompan=z='min(zoom+0.0012,1.15)':d=${totalFrames}:s=1080x1920:fps=${fps}`,
    "-t", String(seconds),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ];
  const { stderr } = await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 20 });
  console.log("[youtube] ffmpeg done:", stderr.slice(-500));
}

export async function generateShort(bundle) {
  if (!bundle.product?.image) throw new Error("Product has no image — video generation needs one");
  const dir = await mkdtemp(path.join(tmpdir(), "yt-"));
  const framePath = path.join(dir, "frame.jpg");
  const outPath = path.join(dir, "out.mp4");
  try {
    const frame = await buildFrame(bundle.product.image);
    await writeFile(framePath, frame);
    await renderVideo(framePath, outPath);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildMultipartBody(metadata, videoBuffer, boundary) {
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--`);
  return Buffer.concat([preamble, videoBuffer, closing]);
}

export async function createYoutubeShort(bundle) {
  const token = await getAccessToken();
  const videoBuffer = await generateShort(bundle);

  const title = (bundle.ad?.headline || bundle.product?.name || "New at My Pet Store").slice(0, 95) + " #Shorts";
  const description = [
    bundle.ad?.hook,
    bundle.ad?.body,
    bundle.ad?.cta,
    bundle.product?.url ? `Shop now: ${bundle.product.url}` : "",
    "#Shorts #PetProducts #MyPetStore",
  ].filter(Boolean).join("\n\n").slice(0, 4900);

  const metadata = {
    snippet: {
      title,
      description,
      categoryId: "15", // Pets & Animals
    },
    status: {
      privacyStatus: process.env.YOUTUBE_UPLOAD_PRIVACY || "private",
      selfDeclaredMadeForKids: false,
    },
  };

  const boundary = `yt_boundary_${Date.now()}`;
  const body = buildMultipartBody(metadata, videoBuffer, boundary);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const raw = await res.text();
  console.log("[youtube] upload response status:", res.status, "body:", raw.slice(0, 400));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`YouTube upload returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!res.ok || !data.id) {
    throw new Error(`YouTube upload failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { id: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
}
