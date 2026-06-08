export interface MethodologyWindow {
  label: string;
  start_year: number;
  end_year: number;
}

export interface MethodologyConfig {
  early_window: MethodologyWindow;
  recent_window: MethodologyWindow;
}

/**
 * Methodology config for the Rising Star scoring system.
 * Updated annually when the recent_window rolls forward.
 * Consumed by detail-page components that surface trajectory data.
 *
 * Single source of truth - do not duplicate these literals in
 * components. Import this config instead.
 */
export const RISING_STAR_METHODOLOGY: MethodologyConfig = {
  early_window: {
    label: "2016-2020",
    start_year: 2016,
    end_year: 2020,
  },
  recent_window: {
    label: "2021-2025",
    start_year: 2021,
    end_year: 2025,
  },
};
