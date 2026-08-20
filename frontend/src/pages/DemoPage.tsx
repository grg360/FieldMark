import { CSSProperties } from "react";
import { FONT } from "../lib/designTokens";
import { taLabelForSlug } from "../lib/taLabels";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#0A0A0B",
  color: "#E8E6DF",
  fontFamily: "system-ui, -apple-system, sans-serif",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "48px 24px 64px",
};

const containerStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 32,
};

const textBlockStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1000,
};

const wordmarkStyle: CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.22em",
  color: "#E8A020",
  textTransform: "uppercase",
  textAlign: "center",
  marginBottom: 10,
};

const headlineStyle: CSSProperties = {
  fontFamily: FONT.serif,
  fontSize: 44,
  fontWeight: 600,
  lineHeight: 1.15,
  textAlign: "center",
  color: "#E8E6DF",
  margin: 0,
  letterSpacing: "-0.01em",
};

const subheadStyle: CSSProperties = {
  fontFamily: FONT.serif,
  fontSize: 18,
  color: "#9B9892",
  textAlign: "center",
  marginTop: 12,
  marginBottom: 0,
  fontWeight: 300,
};

const videoFrameStyle: CSSProperties = {
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid #2A2A2A",
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6), 0 0 80px rgba(232, 160, 32, 0.06)",
  backgroundColor: "#0F0F0F",
  width: "100%",
};

const videoAspectStyle: CSSProperties = {
  position: "relative",
  paddingTop: "56.25%",
};

const iframeStyle: CSSProperties = {
  border: "none",
  position: "absolute",
  top: 0,
  left: 0,
  height: "100%",
  width: "100%",
};

const paragraphStyle: CSSProperties = {
  fontFamily: FONT.serif,
  fontSize: 16,
  lineHeight: 1.7,
  color: "#C8C5BE",
  maxWidth: 720,
  margin: "0 auto",
  textAlign: "center",
  textWrap: "pretty",
};

const statsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
  gap: 24,
  fontSize: 14,
  color: "#9B9892",
  borderTop: "1px solid #1E1E22",
  borderBottom: "1px solid #1E1E22",
  padding: "20px 0",
};

const statStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};

const statValueStyle: CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 22,
  fontWeight: 500,
  color: "#E8E6DF",
  fontVariantNumeric: "tabular-nums",
};

const statLabelStyle: CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 10,
  color: "#6B6A65",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
};

const ctaWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
};

const ctaButtonStyle: CSSProperties = {
  display: "inline-block",
  padding: "14px 32px",
  backgroundColor: "#E8A020",
  color: "#0A0A0B",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 15,
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  letterSpacing: "0.02em",
};

const footerStyle: CSSProperties = {
  marginTop: 48,
  paddingTop: 24,
  borderTop: "1px solid #1E1E22",
  fontSize: 12,
  color: "#6B6A65",
  textAlign: "center",
  width: "100%",
  maxWidth: 1000,
};

// HAND-MAINTAINED FIGURES, corrected 2026-08-20. These four tiles are string
// literals: /demo is an unauthenticated marketing surface with no Supabase
// client and no query path, so there is nothing here to derive them from. That
// makes them the only numbers on the platform that can drift silently — every
// other stat tile in the app reads its value from an RPC.
//
// THEY MUST BE RE-VERIFIED AGAINST THE LIVE COUNTS BEFORE ANY EXTERNAL USE —
// a deck, a demo, a link sent outside the team. Rounded and "+"-suffixed on
// purpose: a figure that claims less precision than it has cannot go stale in
// the way an exact count does. Whoever refreshes these should record the date
// on this line and say what they were checked against.
const stats = [
  { value: "17,000+", label: `Scored ${taLabelForSlug("nsclc")} Investigators` },
  { value: "87,000", label: `${taLabelForSlug("nsclc")} Publications` },
  { value: "88", label: "Countries" },
  { value: "22,000+", label: "Extracted Scientific Positions" },
];

export default function DemoPage() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={textBlockStyle}>
          <div style={wordmarkStyle}>Bessel Analytics</div>
          <h1 style={headlineStyle}>We see the nebula. Not just the star.</h1>
          <p style={subheadStyle}>A walkthrough of FieldMark for Non-Small Cell Lung Cancer.</p>
        </div>

        <div style={videoFrameStyle}>
          <div style={videoAspectStyle}>
            <iframe
              src="https://customer-vnv0tydawqbi5840.cloudflarestream.com/a3b5fdd78c301782e334eaed1d76de12/iframe?poster=https%3A%2F%2Fcustomer-vnv0tydawqbi5840.cloudflarestream.com%2Fa3b5fdd78c301782e334eaed1d76de12%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600"
              loading="lazy"
              style={iframeStyle}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              title="FieldMark walkthrough"
            />
          </div>
        </div>

        <div style={textBlockStyle}>
          <p style={paragraphStyle}>
            FieldMark is an HCP intelligence platform for MSL and Medical Affairs teams. This
            walkthrough demonstrates the platform for Non-Small Cell Lung Cancer - our launch
            indication. The architecture is therapeutic-area agnostic with new indications
            replicable in 7-10 days. The data stack includes PubMed, ClinicalTrials.gov,
            OpenAlex, NIH RePORTER, NPPES, Open Payments, Medicare, Twitter, and Bluesky.
          </p>
        </div>

        <div style={{ ...textBlockStyle, ...statsRowStyle }}>
          {stats.map((s) => (
            <div key={s.label} style={statStyle}>
              <span style={statValueStyle}>{s.value}</span>
              <span style={statLabelStyle}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ ...textBlockStyle, ...ctaWrapStyle }}>
          <a
            href="mailto:fieldmark@besselanalytics.com?subject=FieldMark%20access%20request"
            style={ctaButtonStyle}
          >
            Get in touch
          </a>
          <div style={{ fontSize: 12, color: "#6B6A65" }}>fieldmark@besselanalytics.com</div>
        </div>
      </div>

      <div style={footerStyle}>
        Bessel Analytics
      </div>
    </div>
  );
}
