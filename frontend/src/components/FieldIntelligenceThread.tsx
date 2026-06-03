import { useState, type CSSProperties } from "react";
import { getPostById } from "../data/mockFieldIntelligencePosts";
import { FiAvatar, FiChannelPill, FiMslVerified } from "./FieldIntelligenceShared";

interface FieldIntelligenceThreadProps {
  postId: string;
  onBack: () => void;
  onToast: (message: string) => void;
}

export default function FieldIntelligenceThread({ postId, onBack, onToast }: FieldIntelligenceThreadProps) {
  const post = getPostById(postId);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  if (!post) {
    return (
      <div style={{ padding: 24, color: "rgba(232, 230, 223, 0.7)" }}>
        Thread not found.{" "}
        <button type="button" onClick={onBack} style={linkBtnStyle}>
          Back
        </button>
      </div>
    );
  }

  function handleReplySubmit() {
    setReplyOpen(false);
    setReplyDraft("");
    onToast("Reply posted");
  }

  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button type="button" onClick={onBack} style={{ ...linkBtnStyle, marginBottom: 16 }}>
        ← Back to Field Intelligence
      </button>

      <div style={{ marginBottom: 12 }}>
        <FiChannelPill channel={post.channel} />
      </div>

      <h1
        style={{
          margin: "0 0 12px",
          fontSize: 18,
          fontWeight: 600,
          color: "rgba(232, 230, 223, 1)",
          lineHeight: 1.35,
        }}
      >
        {post.title}
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <FiAvatar handle={post.handle} />
        <span style={{ fontSize: 13, color: "rgba(232, 230, 223, 0.85)" }}>@{post.handle}</span>
        <FiMslVerified />
        <span style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.45)" }}>{post.timestamp}</span>
      </div>

      <div
        style={{
          fontSize: 14,
          color: "rgba(232, 230, 223, 0.85)",
          lineHeight: 1.65,
          marginBottom: 24,
          padding: 16,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 4,
        }}
      >
        {post.body}
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "rgba(232, 230, 223, 0.5)", marginBottom: 12 }}>
        Replies ({post.replies.length})
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {post.replies.map((reply) => (
          <div
            key={reply.id}
            style={{
              padding: 14,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FiAvatar handle={reply.handle} />
              <span style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.8)" }}>@{reply.handle}</span>
              <span style={{ fontSize: 11, color: "rgba(232, 230, 223, 0.4)" }}>{reply.timestamp}</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(232, 230, 223, 0.75)", lineHeight: 1.55 }}>{reply.body}</div>
          </div>
        ))}
      </div>

      {!replyOpen ? (
        <button type="button" onClick={() => setReplyOpen(true)} style={primaryBtnStyle}>
          Reply
        </button>
      ) : (
        <div
          style={{
            padding: 16,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 4,
          }}
        >
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Structured reply format coming soon — for now, post a structured observation"
            rows={4}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 4,
              color: "rgba(232, 230, 223, 0.9)",
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
              resize: "vertical",
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleReplySubmit} style={primaryBtnStyle}>
              Post reply
            </button>
            <button type="button" onClick={() => setReplyOpen(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "rgba(120, 200, 255, 0.9)",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
  fontFamily: "system-ui, sans-serif",
};

const primaryBtnStyle: CSSProperties = {
  padding: "10px 16px",
  background: "rgba(120, 200, 255, 0.12)",
  border: "1px solid rgba(120, 200, 255, 0.35)",
  borderRadius: 4,
  color: "rgba(120, 200, 255, 1)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};

const secondaryBtnStyle: CSSProperties = {
  padding: "10px 16px",
  background: "transparent",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 4,
  color: "rgba(232, 230, 223, 0.6)",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};
