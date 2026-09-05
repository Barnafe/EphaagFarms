/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        soil: {
          50: "#f8f4e9",
          100: "#efe6cf",
          200: "#ddccA0",
          400: "#a68a55",
          600: "#7a5f34",
          800: "#4a3a20",
          900: "#2e2513",
        },
        canopy: {
          50: "#e9f1e6",
          100: "#c9dfc0",
          200: "#9cc48b",
          300: "#7bb066",
          400: "#4f8c3f",
          600: "#2c6b2f",
          700: "#234f27",
          800: "#1c4720",
          900: "#122e16",
          // Darkest app-shell background (DashboardShell's outer frame) — one
          // shade below 900 so the shell reads as a seamless continuation of
          // .dash-scope's own bg-canopy-900, never a gap. Added 2026-09-04:
          // every "bg-canopy-950" call site was silently rendering transparent
          // before this (950 didn't exist in this palette), which is what let
          // the page's cream body color show through on mobile — see the
          // 2026-09-04 mobile-overflow bug note in [[ephaag-farms]] memory.
          950: "#0b2410",
        },
        harvest: {
          50: "#fbf1dd",
          100: "#f3dda3",
          400: "#dba532",
          500: "#c68d25",
          600: "#a97918",
          800: "#7a5711",
        },
        clay: {
          50: "#fbe9e9",
          100: "#f5c3c2",
          400: "#e0524f",
          600: "#c81020",
          700: "#ac1420",
          800: "#901018",
          900: "#5c0a10",
        },
        ink: {
          50: "#f3f1ea",
          400: "#8c8676",
          500: "#6b6656",
          600: "#4a463c",
          700: "#362f27",
          800: "#282419",
          900: "#1b1811",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
