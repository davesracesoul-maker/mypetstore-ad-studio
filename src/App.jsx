import { useState } from "react";
import ContentCalendar from "./ContentCalendar.jsx";

const PLATFORMS = [
  { id: "facebook", label: "Facebook", icon: "f", color: "#1877F2" },
  { id: "instagram", label: "Instagram", icon: "📷", color: "#E1306C" },
  { id: "tiktok", label: "TikTok", icon: "♪", color: "#010101" },
  { id: "google", label: "Google", icon: "G", color: "#4285F4" },
];

const FORMATS = [
  { id: "static", label: "Static Ad", icon: "🖼️", desc: "Image + copy" },
  { id: "video_script", label: "Video Script", icon: "🎬", desc: "UGC-style script" },
  { id: "carousel", label: "Carousel", icon: "🔄", desc: "Multi-slide story" },
  { id: "story", label: "Story / Reel", icon: "📱", desc: "Vertical short-form" },
];

const FRAMEWORKS = [
  { id: "aida", label: "AIDA", desc: "Attention → Interest → Desire → Action" },
  { id: "pas", label: "PAS", desc: "Problem → Agitate → Solution" },
  { id: "bab", label: "Before-After-Bridge", desc: "Transform the story arc" },
  { id: "fab", label: "FAB", desc: "Features → Advantages → Benefits" },
];

const TONES = ["Playful & Fun", "Urgent & Bold", "Warm & Trustworthy", "Premium & Polished"];

const SAMPLE_PRODUCTS = [
  { name: "Interactive Dog Toy", price: "$24.99", desc: "Self-rotating ball that keeps dogs entertained for hours. No batteries needed, USB rechargeable." },
  { name: "Cat Water Fountain", price: "$39.99", desc: "Stainless steel pet fountain with 3 flow modes. Ultra-quiet pump, encourages hydration." },
  { name: "No-Pull Dog Harness", price: "$34.99", desc: "Padded chest harness with reflective stitching. Stops pulling instantly, fits all breeds." },
];

function wrapCanvasText(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function buildVideoBeats(ad) {
  const wordsPerSec = 2.5;
  const minBeat = 1.6;
  const maxBeat = 6;
  const beats = [];
  const addBeat = (text, kind) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const dur = Math.min(maxBeat, Math.max(minBeat, words / wordsPerSec));
    beats.push({ text: trimmed, kind, dur });
  };
  if (ad.hook) addBeat(ad.hook, "hook");
  (ad.script || "").split(/(\[[^\]]*\])/).map((p) => p.trim()).filter(Boolean).forEach((p) => {
    if (/^\[.*\]$/.test(p)) addBeat(p.slice(1, -1), "direction");
    else addBeat(p, "line");
  });
  if (ad.cta) addBeat(ad.cta, "cta");
  return beats;
}

async function renderScriptVideo(ad, onProgress) {
  const beats = buildVideoBeats(ad);
  if (!beats.length) throw new Error("Nothing to render — this ad has no script, hook, or CTA text.");

  const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mimeType = mimeCandidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error("Video recording isn't supported in this browser — try Chrome, Edge, or Firefox.");

  const totalDur = beats.reduce((sum, b) => sum + b.dur, 0);
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  const startTime = performance.now();

  const draw = (elapsedSec) => {
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "#2B1F14");
    g.addColorStop(1, "#4A2E1A");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#FF8A4C";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐾 mypetstore.shop", canvas.width / 2, 100);

    let t = elapsedSec;
    let idx = 0;
    while (idx < beats.length - 1 && t > beats[idx].dur) { t -= beats[idx].dur; idx++; }
    const beat = beats[idx];
    const progress = Math.min(1, t / beat.dur);
    const fade = Math.max(0, Math.min(1, progress * 6, (1 - progress) * 6));

    ctx.globalAlpha = fade;
    ctx.fillStyle = beat.kind === "direction" ? "rgba(255,255,255,0.55)" : "#fff";
    ctx.font = beat.kind === "direction" ? "italic 30px sans-serif" : beat.kind === "cta" ? "bold 54px sans-serif" : "bold 42px sans-serif";
    wrapCanvasText(ctx, beat.text, canvas.width / 2, canvas.height / 2, canvas.width - 120, beat.kind === "direction" ? 38 : 54);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(60, canvas.height - 60, canvas.width - 120, 6);
    ctx.fillStyle = "#FF8A4C";
    ctx.fillRect(60, canvas.height - 60, (canvas.width - 120) * (elapsedSec / totalDur), 6);
  };

  await new Promise((resolve) => {
    const intervalId = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      draw(Math.min(elapsed, totalDur));
      if (onProgress) onProgress(Math.min(100, Math.round((elapsed / totalDur) * 100)));
      if (elapsed >= totalDur) {
        clearInterval(intervalId);
        recorder.stop();
        resolve();
      }
    }, 1000 / 30);
  });

  await stopped;
  const blob = new Blob(chunks, { type: mimeType });
  return URL.createObjectURL(blob);
}

function AdPreviewCard({ ad, platform, format }) {
  const [copied, setCopied] = useState(false);
  const allText = Object.values(ad)
    .map((v) => (Array.isArray(v) ? v.join("\n") : v))
    .join("\n\n");

  const copy = () => {
    navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #E8E0D5", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: "#F9F6F1", borderBottom: "1px solid #E8E0D5", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#5C5040" }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: PLATFORMS.find(p => p.id === platform)?.color || "#333", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {PLATFORMS.find(p => p.id === platform)?.icon}
        </span>
        {PLATFORMS.find(p => p.id === platform)?.label} · {FORMATS.find(f => f.id === format)?.label}
      </div>
      <div style={{ padding: "20px" }}>
        {ad.headline && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 4 }}>Headline</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#2B1F14", lineHeight: 1.3 }}>{ad.headline}</div>
          </div>
        )}
        {ad.hook && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 4 }}>Hook</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#2B1F14", lineHeight: 1.4, background: "#FFF8EF", padding: "10px 12px", borderRadius: 8, borderLeft: "3px solid #FF8A4C" }}>{ad.hook}</div>
          </div>
        )}
        {ad.body && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#9B8B7A", marginBottom: 4 }}>Body Copy</div>
            <div style={{ fontSize: 14, color: "#5C5040", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ad.body}</div>
          </div>
        )}
        {ad.script && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#9B8B7A", marginBottom: 4 }}>Script</div>
            <div style={{ fontSize: 13, color: "#5C5040", lineHeight: 1.7, background: "#F9F6F1", padding: "12px 14px", borderRadius: 8, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{ad.script}</div>
          </div>
        )}
        {ad.slides && Array.isArray(ad.slides) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#9B8B7A", marginBottom: 8 }}>Slides</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ad.slides.map((slide, i) => (
                <div key={i} style={{ background: "#F9F6F1", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#5C5040" }}>
                  <span style={{ fontWeight: 700, color: "#FF8A4C", marginRight: 6 }}>Slide {i + 1}:</span>{slide}
                </div>
              ))}
            </div>
          </div>
        )}
        {ad.cta && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#9B8B7A", marginBottom: 6 }}>CTA</div>
            <div style={{ display: "inline-block", background: "#FF8A4C", color: "#fff", padding: "8px 22px", borderRadius: 50, fontSize: 13, fontWeight: 700 }}>{ad.cta}</div>
          </div>
        )}
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #F0E8DC" }}>
        <button onClick={copy} style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "1px solid #E8E0D5", background: copied ? "#D4F0D4" : "#F9F6F1", cursor: "pointer", fontSize: 13, fontWeight: 600, color: copied ? "#2D7A2D" : "#5C5040", transition: "all 0.2s" }}>
          {copied ? "✓ Copied to clipboard!" : "📋 Copy All Copy"}
        </button>
      </div>
    </div>
  );
}

function StaticAdCanvas({ ad, product }) {
  if (!ad) return null;
  return (
    <div style={{ width: "100%", aspectRatio: "1/1", background: "linear-gradient(135deg, #FFF8EF 0%, #FFE8CC 100%)", borderRadius: 16, border: "2px solid #F0D8B8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "28px 24px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,138,76,0.12)" }} />
      <div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(45,156,143,0.1)" }} />
      <div style={{ textAlign: "center", zIndex: 1, width: "100%" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 8 }}>mypetstore.shop</div>
        <div style={{ fontSize: "clamp(16px, 3.5vw, 24px)", fontWeight: 900, color: "#2B1F14", lineHeight: 1.15, letterSpacing: -0.5 }}>{ad.headline || "Your pet deserves the best"}</div>
      </div>
      <div style={{ fontSize: 72, zIndex: 1 }}>🐾</div>
      <div style={{ textAlign: "center", zIndex: 1, width: "100%" }}>
        {product.price && <div style={{ fontSize: 22, fontWeight: 900, color: "#FF8A4C", marginBottom: 10 }}>{product.price}</div>}
        <div style={{ background: "#2B1F14", color: "#fff", padding: "10px 24px", borderRadius: 50, fontSize: 13, fontWeight: 700, display: "inline-block" }}>{ad.cta || "Shop Now →"}</div>
      </div>
    </div>
  );
}

export default function AdStudio() {
  const [view, setView] = useState("studio");
  const [step, setStep] = useState(1);
  const [product, setProduct] = useState({ name: "", price: "", desc: "", url: "" });
  const [platform, setPlatform] = useState("facebook");
  const [format, setFormat] = useState("static");
  const [framework, setFramework] = useState("aida");
  const [tone, setTone] = useState("Playful & Fun");
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState("");

  const resetVideo = () => { setVideoUrl(""); setVideoError(""); setVideoProgress(0); setVideoGenerating(false); };

  const generateVideo = async () => {
    setVideoGenerating(true); setVideoError(""); setVideoUrl(""); setVideoProgress(0);
    try {
      const url = await renderScriptVideo(ads[activeTab], setVideoProgress);
      setVideoUrl(url);
    } catch (e) {
      setVideoError(e.message || "Failed to generate video");
    } finally {
      setVideoGenerating(false);
    }
  };

  const buildShareUrls = (ad, prod) => {
    const url = prod?.url || "https://mypetstore.shop";
    const text = [ad?.headline, ad?.hook].filter(Boolean).join(" — ").slice(0, 250);
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}`,
    };
  };

  const fillSample = (s) => setProduct({ name: s.name, price: s.price, desc: s.desc, url: "https://mypetstore.shop" });

  const generateAds = async () => {
    if (!product.name || !product.desc) { setError("Please add a product name and description."); return; }
    setError(""); setLoading(true); setStep(3); setProgress(10); resetVideo();

    const iv = setInterval(() => setProgress(p => Math.min(p + Math.random() * 12, 88)), 500);

    const fw = FRAMEWORKS.find(f => f.id === framework);
    const fmt = FORMATS.find(f => f.id === format);

    const fieldSpec = {
      static: `"headline" (max 8 words), "hook" (one bold opening sentence), "body" (2-3 sentences using ${fw?.label}), "cta" (max 4 words)`,
      video_script: `"headline" (video title), "hook" (first 3-second line that stops scrolling), "script" (full 30-45 second UGC script with [stage directions] in brackets), "cta" (closing line)`,
      carousel: `"headline" (carousel title), "hook" (slide 1 hook), "slides" (JSON array of 4-5 slide caption strings, each max 10 words), "body" (post caption), "cta" (final slide CTA)`,
      story: `"headline" (story title), "hook" (opening text overlay), "body" (3-4 punchy overlay lines joined by \\n), "cta" (swipe-up CTA text)`,
    }[format];

    const prompt = `You are a direct-response copywriter expert at pet product ads. Write 3 unique ad variations for mypetstore.shop.

PRODUCT: ${product.name}
PRICE: ${product.price || "N/A"}
DESCRIPTION: ${product.desc}
PLATFORM: ${PLATFORMS.find(p => p.id === platform)?.label}
FORMAT: ${fmt?.label}
FRAMEWORK: ${fw?.label} — ${fw?.desc}
TONE: ${tone}

Each variation must follow the ${fw?.label} framework and have these exact JSON fields: ${fieldSpec}.

Return ONLY a raw JSON array of exactly 3 objects. No markdown fences, no explanation, no extra text. Just the array.`;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      clearInterval(iv); setProgress(100);
      if (data.error) throw new Error(data.error?.message || data.error);
      const raw = data.content?.find(b => b.type === "text")?.text;
      if (!raw) throw new Error("No content returned from API");
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setAds(Array.isArray(parsed) ? parsed : [parsed]);
      setActiveTab(0);
      setTimeout(() => setStep(4), 400);
    } catch (e) {
      clearInterval(iv);
      setError("Generation failed — please try again.");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const s = {
    wrap: { minHeight: "100vh", background: "#FAF6F0", fontFamily: "'Inter', -apple-system, sans-serif", color: "#2B1F14" },
    header: { background: "#2B1F14", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 },
    main: { maxWidth: 880, margin: "0 auto", padding: "32px 20px 80px" },
    card: { background: "#fff", border: "1px solid #E8E0D5", borderRadius: 20, padding: "24px 24px", marginBottom: 18 },
    label: { fontSize: 13, fontWeight: 600, color: "#5C5040", marginBottom: 6, display: "block" },
    sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 14 },
    input: { width: "100%", padding: "11px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, color: "#2B1F14", background: "#FDFAF7", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    btn: { background: "#FF8A4C", color: "#fff", border: "none", padding: "14px 36px", borderRadius: 50, fontSize: 15, fontWeight: 700, cursor: "pointer" },
    btnSm: { background: "#F0E8DC", color: "#5C5040", border: "none", padding: "8px 16px", borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: "pointer" },
    pill: (a) => ({ padding: "9px 18px", borderRadius: 50, border: a ? "2px solid #FF8A4C" : "2px solid #E8E0D5", background: a ? "#FFF8EF" : "#fff", color: a ? "#E8702F" : "#5C5040", fontWeight: a ? 700 : 500, fontSize: 13, cursor: "pointer" }),
    fmtCard: (a) => ({ padding: "14px", borderRadius: 12, border: a ? "2px solid #FF8A4C" : "2px solid #E8E0D5", background: a ? "#FFF8EF" : "#fff", cursor: "pointer", flex: 1, minWidth: 110 }),
    fwCard: (a) => ({ padding: "10px 13px", borderRadius: 10, border: a ? "2px solid #FF8A4C" : "2px solid #E8E0D5", background: a ? "#FFF8EF" : "#fff", cursor: "pointer", marginBottom: 6 }),
    toneCard: (a) => ({ padding: "11px 14px", borderRadius: 10, border: a ? "2px solid #FF8A4C" : "2px solid #E8E0D5", background: a ? "#FFF8EF" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: a ? 700 : 500, color: a ? "#E8702F" : "#5C5040", marginBottom: 6 }),
    tab: (a) => ({ padding: "8px 20px", borderRadius: 50, border: "none", background: a ? "#2B1F14" : "#E8E0D5", color: a ? "#fff" : "#5C5040", fontWeight: 700, fontSize: 13, cursor: "pointer" }),
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 800, fontSize: 16 }}>
          <div style={{ width: 30, height: 30, background: "#FF8A4C", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🐾</div>
          MyPetStore <span style={{ color: "#FF8A4C", marginLeft: 4 }}>Ad Studio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setView("studio")} style={{ background: view === "studio" ? "#FF8A4C" : "rgba(255,255,255,0.08)", color: view === "studio" ? "#fff" : "rgba(255,255,255,0.75)", border: "none", padding: "7px 16px", borderRadius: 50, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✨ Ad Studio</button>
          <button onClick={() => setView("calendar")} style={{ background: view === "calendar" ? "#FF8A4C" : "rgba(255,255,255,0.08)", color: view === "calendar" ? "#fff" : "rgba(255,255,255,0.75)", border: "none", padding: "7px 16px", borderRadius: 50, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📅 Content Calendar</button>
        </div>
      </div>

      <div style={s.main}>

        {view === "calendar" && (
          <ContentCalendar onUseProduct={(p) => {
            setProduct({ name: p?.name || "", price: p?.price || "", desc: p?.desc || "", url: p?.url || "" });
            setAds([]); resetVideo(); setStep(1); setView("studio");
            window.scrollTo(0, 0);
          }} />
        )}

        {/* Steps 1 & 2 — Input */}
        {view === "studio" && (step === 1 || step === 2) && (
          <>
            <div style={{ textAlign: "center", marginBottom: 28, paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 10 }}>AI Ad Studio for mypetstore.shop</div>
              <h1 style={{ fontSize: "clamp(26px, 5vw, 42px)", fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.1, margin: "0 0 10px", color: "#2B1F14" }}>
                Create Pet Ads That<br /><span style={{ color: "#FF8A4C" }}>Actually Convert</span>
              </h1>
              <p style={{ fontSize: 15, color: "#756B5E", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
                Describe your product → AI writes scroll-stopping copy for Facebook, Instagram, TikTok & more in seconds.
              </p>
            </div>

            {/* Product Card */}
            <div style={s.card}>
              <div style={s.sectionTitle}>1 · Your Product</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...s.label, marginBottom: 8 }}>Quick-fill from your store:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SAMPLE_PRODUCTS.map(sp => (
                    <button key={sp.name} onClick={() => fillSample(sp)} style={s.btnSm}>{sp.name}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={s.label}>Product Name *</label>
                  <input style={s.input} placeholder="e.g. Interactive Dog Toy" value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} />
                </div>
                <div>
                  <label style={s.label}>Price</label>
                  <input style={s.input} placeholder="e.g. $24.99" value={product.price} onChange={e => setProduct({ ...product, price: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>Description *</label>
                <textarea style={{ ...s.input, minHeight: 80, resize: "vertical" }} placeholder="What makes this product special? Benefits, features, who it's for..." value={product.desc} onChange={e => setProduct({ ...product, desc: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Product URL (optional)</label>
                <input style={s.input} placeholder="https://mypetstore.shop/products/..." value={product.url} onChange={e => setProduct({ ...product, url: e.target.value })} />
              </div>
            </div>

            {/* Settings Card */}
            <div style={s.card}>
              <div style={s.sectionTitle}>2 · Ad Settings</div>

              <div style={{ marginBottom: 18 }}>
                <div style={s.label}>Platform</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PLATFORMS.map(p => <button key={p.id} onClick={() => setPlatform(p.id)} style={s.pill(platform === p.id)}>{p.label}</button>)}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={s.label}>Format</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {FORMATS.map(f => (
                    <div key={f.id} onClick={() => setFormat(f.id)} style={s.fmtCard(format === f.id)}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: format === f.id ? "#E8702F" : "#2B1F14" }}>{f.label}</div>
                      <div style={{ fontSize: 11, color: "#9B8B7A", marginTop: 2 }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={s.label}>Copy Framework</div>
                  {FRAMEWORKS.map(f => (
                    <div key={f.id} onClick={() => setFramework(f.id)} style={s.fwCard(framework === f.id)}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: framework === f.id ? "#E8702F" : "#2B1F14" }}>{f.label}</div>
                      <div style={{ fontSize: 11, color: "#9B8B7A" }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={s.label}>Tone</div>
                  {TONES.map(t => (
                    <div key={t} onClick={() => setTone(t)} style={s.toneCard(tone === t)}>{t}</div>
                  ))}
                </div>
              </div>
            </div>

            {error && <div style={{ padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 10, color: "#C0392B", fontSize: 14, marginBottom: 14 }}>{error}</div>}

            <div style={{ textAlign: "center" }}>
              <button onClick={generateAds} style={s.btn}>✨ Generate 3 Ad Variations</button>
              <div style={{ marginTop: 10, fontSize: 12, color: "#9B8B7A" }}>Uses the {FRAMEWORKS.find(f => f.id === framework)?.label} framework · {tone} tone</div>
            </div>
          </>
        )}

        {/* Step 3 — Loading */}
        {view === "studio" && step === 3 && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Generating Your Ads...</h2>
            <p style={{ color: "#756B5E", marginBottom: 32 }}>Writing {FORMATS.find(f => f.id === format)?.label} copy for <strong>{product.name}</strong> using {FRAMEWORKS.find(f => f.id === framework)?.label}</p>
            <div style={{ maxWidth: 320, margin: "0 auto", background: "#E8E0D5", borderRadius: 50, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 50, background: "linear-gradient(90deg,#FF8A4C,#E8702F)", width: `${progress}%`, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "#9B8B7A" }}>{Math.round(progress)}%</div>
          </div>
        )}

        {/* Step 4 — Results */}
        {view === "studio" && step === 4 && ads.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Your Ad Variations</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#756B5E" }}>
                  {product.name} · {PLATFORMS.find(p => p.id === platform)?.label} · {FORMATS.find(f => f.id === format)?.label} · {FRAMEWORKS.find(f => f.id === framework)?.label}
                </p>
              </div>
              <button onClick={() => { setStep(1); setAds([]); resetVideo(); }} style={s.btnSm}>← New Ad</button>
            </div>

            {/* Variation tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {ads.map((_, i) => <button key={i} onClick={() => { setActiveTab(i); resetVideo(); }} style={s.tab(activeTab === i)}>Variation {i + 1}</button>)}
            </div>

            {/* Ad display */}
            <div style={{ display: "grid", gridTemplateColumns: format === "static" ? "1fr 1fr" : "1fr", gap: 18, marginBottom: 20 }}>
              {format === "static" && <StaticAdCanvas ad={ads[activeTab]} product={product} />}
              <AdPreviewCard ad={ads[activeTab]} platform={platform} format={format} />
            </div>

            {/* All variations summary */}
            {ads.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <div style={s.sectionTitle}>All Variations</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {ads.map((ad, i) => (
                    <div key={i} onClick={() => { setActiveTab(i); resetVideo(); }} style={{ padding: "14px", border: activeTab === i ? "2px solid #FF8A4C" : "2px solid #E8E0D5", borderRadius: 12, cursor: "pointer", background: activeTab === i ? "#FFF8EF" : "#fff" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#FF8A4C", marginBottom: 4 }}>Variation {i + 1}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#2B1F14", lineHeight: 1.3 }}>{ad.headline || ad.hook || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Video */}
            {format === "video_script" && (
              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={s.sectionTitle}>Generate Video (Free)</div>
                <p style={{ fontSize: 13, color: "#756B5E", marginBottom: 12 }}>
                  Renders this script as a text-overlay video (hook → lines → CTA) right in your browser — no cost, no external service, no waiting on an API. This is animated captioned text, not real footage — think kinetic typography, not a filmed ad.
                </p>
                {videoError && <div style={{ padding: "10px 14px", background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 10, color: "#C0392B", fontSize: 13, marginBottom: 12 }}>{videoError}</div>}
                {videoUrl ? (
                  <div>
                    <video controls src={videoUrl} style={{ width: "100%", maxWidth: 260, borderRadius: 12, marginBottom: 12, display: "block", background: "#000" }} />
                    <div style={{ display: "flex", gap: 10 }}>
                      <a href={videoUrl} download="mypetstore-ad-video.webm" style={{ ...s.btn, textDecoration: "none", display: "inline-block" }}>Download Video</a>
                      <button onClick={generateVideo} style={s.btnSm}>Regenerate</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={generateVideo} disabled={videoGenerating} style={{ ...s.btn, opacity: videoGenerating ? 0.6 : 1 }}>
                    {videoGenerating ? `Rendering… ${videoProgress}%` : "🎬 Generate Video"}
                  </button>
                )}
              </div>
            )}

            {/* Share to Social */}
            <div style={{ ...s.card, marginBottom: 20 }}>
              <div style={s.sectionTitle}>Share to Social</div>
              <p style={{ fontSize: 13, color: "#756B5E", marginBottom: 12 }}>
                Opens each platform's own share dialog in a new tab — no setup, no login to anything but your existing social accounts. X and Pinterest pre-fill your ad copy; Facebook and LinkedIn only pre-fill the link, so click "Copy All Copy" above first and paste it into the caption box that opens.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(() => {
                  const shareUrls = buildShareUrls(ads[activeTab], product);
                  return (
                    <>
                      <a href={shareUrls.facebook} target="_blank" rel="noreferrer" style={{ ...s.btnSm, textDecoration: "none", display: "inline-block" }}>Share to Facebook</a>
                      <a href={shareUrls.twitter} target="_blank" rel="noreferrer" style={{ ...s.btnSm, textDecoration: "none", display: "inline-block" }}>Share to X</a>
                      <a href={shareUrls.linkedin} target="_blank" rel="noreferrer" style={{ ...s.btnSm, textDecoration: "none", display: "inline-block" }}>Share to LinkedIn</a>
                      <a href={shareUrls.pinterest} target="_blank" rel="noreferrer" style={{ ...s.btnSm, textDecoration: "none", display: "inline-block" }}>Share to Pinterest</a>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Launch CTA */}
            <div style={{ padding: "24px", background: "#2B1F14", borderRadius: 20, textAlign: "center" }}>
              <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Ready to launch? 🚀</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 18 }}>Copy your ad copy above, then head to your ad platform to launch.</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                <a href="https://www.facebook.com/adsmanager" target="_blank" rel="noreferrer" style={{ ...s.btn, fontSize: 13, padding: "10px 22px", textDecoration: "none" }}>Open Meta Ads Manager ↗</a>
                <a href="https://ads.tiktok.com" target="_blank" rel="noreferrer" style={{ ...s.btnSm, padding: "10px 22px", fontSize: 13, textDecoration: "none" }}>TikTok Ads ↗</a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
