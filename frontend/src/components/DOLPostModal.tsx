import { useEffect, useState } from "react";
import { getLatestPostForHandle } from "../lib/api";
import type { LatestPost, VerifiedDOL } from "../lib/types";
import { buildDOLDisplayName } from "./DOLListingModal";

const ACCENT_COLOR = "#4DD0E1";

function formatFollowerCount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${value}`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 100000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 1000000) return `${Math.round(value / 1000)}K`;
  return `${(value / 1000000).toFixed(1)}M`;
}

function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffDays < 7) return `${Math.floor(diffDays)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOlderThan7Days(isoTimestamp: string): boolean {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

function platformProfileLabel(platform: string): string {
  return platform === "twitter" ? "View on Twitter →" : "View on Bluesky →";
}

interface DOLPostModalProps {
  dol: VerifiedDOL;
  onClose: () => void;
}

export default function DOLPostModal({ dol, onClose }: DOLPostModalProps) {
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<LatestPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWide, setIsWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await getLatestPostForHandle(
        dol.social_user.platform,
        dol.social_user.handle,
      );
      if (cancelled) return;
      setPost(data);
      setError(fetchError);
      setLoading(false);
    }

    void fetchPost();

    return () => {
      cancelled = true;
    };
  }, [dol.social_user.platform, dol.social_user.handle]);

  const handle = dol.social_user.handle.startsWith("@")
    ? dol.social_user.handle
    : `@${dol.social_user.handle}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dol-post-modal-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 110,
        display: "flex",
        flexDirection: "column",
        justifyContent: isWide ? "center" : "flex-end",
        alignItems: "center",
        padding: isWide ? 24 : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          margin: isWide ? undefined : "0 auto",
          backgroundColor: "#111113",
          border: "1px solid #1E1E22",
          borderRadius: isWide ? 8 : "8px 8px 0 0",
          maxHeight: "90dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "0 16px 24px",
        }}
      >
        {!isWide ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, marginBottom: 16 }}>
            <div style={{ width: 32, height: 3, backgroundColor: "#1E1E22", borderRadius: 2 }} />
          </div>
        ) : null}

        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            paddingBottom: 16,
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="dol-post-modal-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 500,
                color: "#E8E6DF",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {buildDOLDisplayName(dol)}
            </h2>
            <div style={{ fontSize: 13, color: ACCENT_COLOR, marginTop: 4, fontFamily: "monospace" }}>
              {handle}
            </div>
            <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 4, fontFamily: "monospace" }}>
              {`${formatFollowerCount(dol.social_user.follower_count)} followers`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 24,
              lineHeight: 1,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </header>

        {loading ? (
          <div style={{ padding: "24px 0", fontSize: 13, color: "#6B6A65" }}>Loading latest post…</div>
        ) : error ? (
          <div style={{ padding: "24px 0", fontSize: 13, color: "#E05555" }}>{error}</div>
        ) : !post ? (
          <div style={{ padding: "24px 0", fontSize: 13, color: "#6B6A65" }}>
            No captured posts found for this account yet.
          </div>
        ) : (
          <div style={{ paddingTop: 16 }}>
            <div
              style={{
                fontSize: 14,
                color: "#B8B4AC",
                lineHeight: 1.6,
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {post.post_text?.trim() || "(No post text captured.)"}
            </div>

            <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 12, fontFamily: "monospace" }}>
              {formatRelativeTime(post.posted_at)}
            </div>

            {isOlderThan7Days(post.posted_at) ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#3A3A3F",
                  marginTop: 8,
                  lineHeight: 1.5,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                This is the most recent post we&apos;ve captured. Newer activity may exist on the platform.
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #1E1E22",
                fontSize: 12,
                color: "#6B6A65",
                fontFamily: "monospace",
              }}
            >
              <span>♥ {post.engagement_likes.toLocaleString()}</span>
              <span>↩ {post.engagement_replies.toLocaleString()}</span>
              <span>🔁 {post.engagement_reposts.toLocaleString()}</span>
              <span>❝ {post.engagement_quotes.toLocaleString()}</span>
            </div>

            {post.hashtags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {post.hashtags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 11,
                      color: ACCENT_COLOR,
                      border: `1px solid ${ACCENT_COLOR}`,
                      borderRadius: 3,
                      padding: "2px 8px",
                      fontFamily: "monospace",
                    }}
                  >
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {dol.social_user.profile_url ? (
          <a
            href={dol.social_user.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              marginTop: 20,
              padding: "10px 12px",
              backgroundColor: "transparent",
              border: "1px solid #1E1E22",
              color: ACCENT_COLOR,
              fontSize: 13,
              textDecoration: "none",
              textAlign: "center",
              borderRadius: 4,
            }}
          >
            {platformProfileLabel(dol.social_user.platform)}
          </a>
        ) : null}
      </div>
    </div>
  );
}
