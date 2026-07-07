import { useState, useEffect } from "react";

function stripBold(s) {
  return s.replace(/\*\*/g, "");
}

function renderContent(text) {
  const lines = (text || "").split("\n");
  const out = [];
  let list = null;
  const pStyle = { fontSize: 14, color: "#5C5040", lineHeight: 1.7, margin: "0 0 10px" };
  const subheadStyle = { fontSize: 15, fontWeight: 700, color: "#2B1F14", margin: "14px 0 6px" };
  const flushList = (key) => {
    if (list) {
      out.push(<ul key={"ul" + key} style={{ ...pStyle, paddingLeft: 20 }}>{list}</ul>);
      list = null;
    }
  };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) { flushList(i); return; }
    if (t.startsWith("- ")) {
      list = list || [];
      list.push(<li key={i}>{stripBold(t.slice(2))}</li>);
      return;
    }
    flushList(i);
    if (t.startsWith("#")) {
      out.push(<div key={i} style={subheadStyle}>{t.replace(/^#+\s*/, "")}</div>);
      return;
    }
    const headingMatch = t.match(/^\*\*(.+)\*\*:?$/);
    if (headingMatch) {
      out.push(<div key={i} style={subheadStyle}>{headingMatch[1]}</div>);
      return;
    }
    out.push(<p key={i} style={pStyle}>{stripBold(t)}</p>);
  });
  flushList("end");
  return out;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy} style={{ padding: "7px 16px", borderRadius: 50, border: "1px solid #E8E0D5", background: copied ? "#D4F0D4" : "#F9F6F1", cursor: "pointer", fontSize: 12, fontWeight: 600, color: copied ? "#2D7A2D" : "#5C5040", transition: "all 0.2s" }}>
      {copied ? "✓ Copied!" : "📋 Copy"}
    </button>
  );
}

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ContentCalendar({ onUseProduct }) {
  const [bundles, setBundles] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    fetch("/api/content-calendar")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setBundles(d.bundles || []);
      })
      .catch((e) => setError(e.message || "Failed to load content calendar"));
  }, []);

  const card = { background: "#fff", border: "1px solid #E8E0D5", borderRadius: 20, padding: "22px 24px", marginBottom: 18 };
  const sectionTitle = { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#FF8A4C" };
  const cardHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 };

  if (error) {
    return <div style={{ padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 10, color: "#C0392B", fontSize: 14 }}>{error}</div>;
  }
  if (bundles === null) {
    return <div style={{ textAlign: "center", padding: "80px 20px", color: "#756B5E", fontSize: 15 }}>Loading your content calendar…</div>;
  }
  if (!bundles.length) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: "#2B1F14" }}>No content yet</h2>
        <p style={{ color: "#756B5E", fontSize: 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
          Fresh content is generated automatically every morning. Check back after the next daily run.
        </p>
      </div>
    );
  }

  const b = bundles[Math.min(selected, bundles.length - 1)];
  const blogLines = (b.blogPost || "").split("\n");
  const blogTitle = blogLines[0]?.startsWith("TITLE:") ? blogLines[0].replace(/^TITLE:\s*/, "") : "";
  const blogBody = blogTitle ? blogLines.slice(1).join("\n").trim() : b.blogPost;

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 10 }}>Fresh every morning</div>
        <h1 style={{ fontSize: "clamp(24px, 4.5vw, 36px)", fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, margin: "0 0 10px", color: "#2B1F14" }}>Content Calendar</h1>
        <p style={{ fontSize: 14, color: "#756B5E", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
          Every day, AI picks a product from your store and writes a full content bundle — ad, blog post, press release & tip.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20, justifyContent: "center" }}>
        {bundles.map((bundle, i) => (
          <button key={bundle.date + i} onClick={() => setSelected(i)} style={{ padding: "8px 16px", borderRadius: 50, border: selected === i ? "2px solid #FF8A4C" : "2px solid #E8E0D5", background: selected === i ? "#FFF8EF" : "#fff", color: selected === i ? "#E8702F" : "#5C5040", fontWeight: selected === i ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
            {formatDate(bundle.date)}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {b.product?.image && (
            <img src={b.product.image} alt={b.product?.name || "Product"} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", border: "1px solid #E8E0D5", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A4C", marginBottom: 4 }}>Featured product · {formatDate(b.date)}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#2B1F14", lineHeight: 1.3 }}>{b.product?.name}</div>
            <div style={{ fontSize: 13, color: "#756B5E", marginTop: 2 }}>
              {b.product?.price}{b.product?.url && <> · <a href={b.product.url} target="_blank" rel="noreferrer" style={{ color: "#E8702F" }}>View in store ↗</a></>}
            </div>
          </div>
          {onUseProduct && (
            <button onClick={() => onUseProduct(b.product)} style={{ background: "#FF8A4C", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 50, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ✨ Use in Ad Studio
            </button>
          )}
        </div>
      </div>

      {b.ad && (
        <div style={card}>
          <div style={cardHeader}>
            <div style={sectionTitle}>Social Ad</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {b.tweetUrl && <a href={b.tweetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "#2D7A2D", textDecoration: "none" }}>✓ Posted to X ↗</a>}
              <CopyButton text={[b.ad.headline, b.ad.hook, b.ad.body, b.ad.cta].filter(Boolean).join("\n\n")} />
            </div>
          </div>
          {b.ad.headline && <div style={{ fontSize: 17, fontWeight: 800, color: "#2B1F14", lineHeight: 1.3, marginBottom: 10 }}>{b.ad.headline}</div>}
          {b.ad.hook && <div style={{ fontSize: 14, fontWeight: 700, color: "#2B1F14", lineHeight: 1.4, background: "#FFF8EF", padding: "10px 12px", borderRadius: 8, borderLeft: "3px solid #FF8A4C", marginBottom: 10 }}>{b.ad.hook}</div>}
          {b.ad.body && <div style={{ fontSize: 14, color: "#5C5040", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-wrap" }}>{b.ad.body}</div>}
          {b.ad.cta && <div style={{ display: "inline-block", background: "#FF8A4C", color: "#fff", padding: "8px 22px", borderRadius: 50, fontSize: 13, fontWeight: 700 }}>{b.ad.cta}</div>}
        </div>
      )}

      {b.dailyTip && (
        <div style={{ ...card, background: "#F3F9F0", border: "1px solid #D8E8D0" }}>
          <div style={cardHeader}>
            <div style={{ ...sectionTitle, color: "#4A7A3A" }}>💡 Daily Pet Tip</div>
            <CopyButton text={b.dailyTip} />
          </div>
          <div style={{ fontSize: 14, color: "#3E5C34", lineHeight: 1.7 }}>{b.dailyTip}</div>
        </div>
      )}

      {b.blogPost && (
        <div style={card}>
          <div style={cardHeader}>
            <div style={sectionTitle}>Blog Post</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {b.blogUrl && <a href={b.blogUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "#2D7A2D", textDecoration: "none" }}>✓ Live on your blog ↗</a>}
              <CopyButton text={b.blogPost} />
            </div>
          </div>
          {blogTitle && <div style={{ fontSize: 19, fontWeight: 800, color: "#2B1F14", lineHeight: 1.3, marginBottom: 12 }}>{stripBold(blogTitle)}</div>}
          {renderContent(blogBody)}
        </div>
      )}

      {b.pressRelease && (
        <div style={card}>
          <div style={cardHeader}>
            <div style={sectionTitle}>Press Release</div>
            <CopyButton text={b.pressRelease} />
          </div>
          {renderContent(b.pressRelease)}
        </div>
      )}
    </>
  );
}
