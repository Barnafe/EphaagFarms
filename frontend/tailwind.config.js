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
          400: "#4f8c3f",
          600: "#2c6b2f",
          800: "#1c4720",
          900: "#122e16",
        },
        harvest: {
          50: "#fbf1dd",
          100: "#f3dda3",
          400: "#dba532",
          600: "#a97918",
        },
        clay: {
          50: "#fbe9e9",
          100: "#f5c3c2",
          400: "#e0524f",
          600: "#c81020",
          800: "#901018",
          900: "#5c0a10",
        },
        ink: {
          50: "#f3f1ea",
          600: "#4a463c",
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
