import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F7F6F3",
        card: "#FFFFFF",
        border: "#E4E1D9",
        navy: {
          DEFAULT: "#1B3A6B",
          light: "#234D8F",
          dark: "#122549",
        },
        stamp: {
          DEFAULT: "#C2400C",
          light: "#D4531F",
          dark: "#9A3209",
        },
        ink: {
          DEFAULT: "#1A1916",
          secondary: "#6B6760",
          muted: "#9C9890",
        },
        status: {
          draft: "#9C9890",
          submitted: "#2563EB",
          pending: "#B45309",
          approved: "#1A6B3C",
          rejected: "#9B1C1C",
          ordered: "#6D28D9",
          received: "#0E7490",
          ready: "#047857",
          complete: "#6B6760",
          hold: "#C2400C",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(26, 25, 22, 0.08), 0 1px 2px -1px rgba(26, 25, 22, 0.06)",
        "card-hover": "0 4px 6px -1px rgba(26, 25, 22, 0.08), 0 2px 4px -2px rgba(26, 25, 22, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
