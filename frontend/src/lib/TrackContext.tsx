import { createContext, useContext, useState, type ReactNode } from "react";

export type Track =
  | "community"
  | "rising-stars"
  | "established"
  | "telescope"
  | "social"
  | "field-intelligence";

interface TrackContextValue {
  track: Track;
  setTrack: (track: Track) => void;
}

const TrackContext = createContext<TrackContextValue | null>(null);

const STORAGE_KEY = "fieldmark.track";
const DEFAULT_TRACK: Track = "established";

export function TrackProvider({ children }: { children: ReactNode }) {
  const [track, setTrackState] = useState<Track>(() => {
    if (typeof window === "undefined") return DEFAULT_TRACK;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    // "social" and "field-intelligence" are deliberately absent: both feed
    // tracks were retired 2026-07-31 (Social is a top-level destination; the FI
    // forum is the one FI system), so a stale stored value falls back to the
    // default rather than activating a trackless feed.
    if (
      stored === "community" ||
      stored === "rising-stars" ||
      stored === "established" ||
      stored === "telescope"
    ) {
      return stored;
    }
    return DEFAULT_TRACK;
  });

  const setTrack = (next: Track) => {
    setTrackState(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <TrackContext.Provider value={{ track, setTrack }}>
      {children}
    </TrackContext.Provider>
  );
}

export function useTrack(): TrackContextValue {
  const ctx = useContext(TrackContext);
  if (!ctx) {
    throw new Error("useTrack must be used inside <TrackProvider>");
  }
  return ctx;
}
