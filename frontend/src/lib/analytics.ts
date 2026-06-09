import posthog from "posthog-js";

const POSTHOG_KEY = "phc_xS4bevzEsdA49sePWi4qcuswU3axF2x7cq25zszqk9fz";
const POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
        email: false,
      },
    },
    loaded: (_ph) => {
      // For local dev, you can uncomment to disable in development
      // if (import.meta.env.MODE === "development") ph.opt_out_capturing();
    },
  });

  initialized = true;
}

export function identifyUser(
  userId: string,
  properties: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    region?: string | null;
  },
) {
  if (!initialized) return;
  posthog.identify(userId, {
    email: properties.email ?? undefined,
    first_name: properties.first_name ?? undefined,
    last_name: properties.last_name ?? undefined,
    company: properties.company ?? undefined,
    region: properties.region ?? undefined,
  });
}

export function resetIdentification() {
  if (!initialized) return;
  posthog.reset();
}

export function track(eventName: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(eventName, properties);
}
