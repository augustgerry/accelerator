import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0A0F1A",
          900: "#0E1524",
          800: "#141D30",
          700: "#1C2740",
        },
        surface: {
          DEFAULT: "#F6F7F9",
          raised: "#FFFFFF",
          border: "#E4E7EC",
        },
        text: {
          primary: "#151B2B",
          secondary: "#5B6473",
          muted: "#8A93A3",
        },
        accent: {
          DEFAULT: "#0E7C86",
          soft: "#E4F3F3",
          strong: "#0B646C",
        },
        gold: {
          DEFAULT: "#A9803D",
          soft: "#F6EFE1",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "Roboto Mono",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(16, 24, 40, 0.04)",
        panel: "0 4px 24px rgba(10, 15, 26, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
