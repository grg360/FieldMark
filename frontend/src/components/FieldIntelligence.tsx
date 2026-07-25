import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { track } from "../lib/analytics";
import { getRecentPosts, therapeuticAreaToChannel } from "../data/mockFieldIntelligencePosts";import { buildFieldIntelligenceThreadPath, taLabelToSlug } from "../lib/routeSlugs";
import { FiAvatar, FiMslVerified } from "./FieldIntelligenceShared";
import FieldIntelligenceThread from "./FieldIntelligenceThread";

interface FieldIntelligenceProps {
  therapeuticArea: string;
  selectedIndication: string;
  onToast: (message: string) => void;
  onSurfaceHcp: () => void;
}

export default function FieldIntelligence({
  therapeuticArea,
  selectedIndication,
  onToast,
  onSurfaceHcp,
}: FieldIntelligenceProps) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const channel = therapeuticAreaToChannel(therapeuticArea);

  // Appetite signal: fires when the Field Intelligence screen opens (and on TA
  // change). Reader-side only — the post/reply flow is still mock, so those
  // events (and is_seeded) are deferred until FI has a real backend.
  useEffect(() => {
    track("field_intel_viewed", { therapeutic_area: taLabelToSlug(therapeuticArea) });
  }, [therapeuticArea]);

  const recentPosts = useMemo(() => {
    const taPosts = channel ? getRecentPosts(20, channel) : [];
    if (!selectedIndication || selectedIndication === "All") {
      return taPosts;
    }
    return taPosts.filter((post) => {
      if (!post.indication) {
        return true;
      }
      return post.indication === selectedIndication || post.channel === selectedIndication;
    });
  }, [channel, selectedIndication]);
  function openThread(postId: string) {
    const taSlug =
      params.ta ??
      (location.pathname === "/"
        ? "oncology"
        : taLabelToSlug(therapeuticArea));
    navigate(buildFieldIntelligenceThreadPath(taSlug, postId));
  }
  const scopeLabel = selectedIndication === "All" ? therapeuticArea : selectedIndication;

  return (
    <div style={{ padding: "0 0 32px" }}>
      <div style={{ padding: "8px 16px 20px" }}>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: 20,
            fontWeight: 600,
            color: "rgba(232, 230, 223, 1)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Field Intelligence
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "rgba(120, 200, 255, 0.85)" }}>
          {scopeLabel}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(232, 230, 223, 0.55)", lineHeight: 1.5 }}>
          MSL-verified community — anonymous to peers, verified by FieldMark
        </p>
      </div>

      <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onSurfaceHcp}
          style={{
            padding: "8px 14px",
            background: "rgba(120, 200, 255, 0.1)",
            border: "1px solid rgba(120, 200, 255, 0.35)",
            borderRadius: 4,
            color: "rgba(120, 200, 255, 1)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          + Surface a new HCP
        </button>
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "rgba(232, 230, 223, 0.5)",
            marginBottom: 12,
          }}
        >
          Recent Activity
        </div>

        {recentPosts.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "rgba(232, 230, 223, 0.5)",
              lineHeight: 1.5,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 4,
              background: "rgba(255, 255, 255, 0.02)",
            }}
          >
            No discussions yet — be the first to post
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => openThread(post.id)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "system-ui, sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <FiAvatar handle={post.handle} />
                  <span style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.8)" }}>@{post.handle}</span>
                  <FiMslVerified />
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(232, 230, 223, 0.4)" }}>
                    {post.timestamp}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(232, 230, 223, 0.45)", marginBottom: 6 }}>
                  {post.replyCount} replies
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "rgba(232, 230, 223, 0.95)",
                    marginBottom: 6,
                  }}
                >
                  {post.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(232, 230, 223, 0.55)",
                    lineHeight: 1.45,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {post.body}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          margin: "16px 16px 0",
          padding: "14px 16px",
          background: "rgba(120, 200, 255, 0.06)",
          border: "1px solid rgba(120, 200, 255, 0.15)",
          borderRadius: 4,
          fontSize: 12,
          color: "rgba(232, 230, 223, 0.6)",
          lineHeight: 1.5,
        }}
      >
        Topic discussion only — no HCP names in posts. Use HCP profiles for HCP-specific contributions.
      </div>
    </div>
  );
}
