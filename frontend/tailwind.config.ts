import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B0F19",
          900: "#111827",
          800: "#1F2430",
          700: "#2B3140",
        },
        surface: {
          DEFAULT: "#F7F8FA",
          raised: "#FFFFFF",
          border: "#E5E7EB",
        },
        text: {
          primary: "#1A1D29",
          secondary: "#5B6473",
          muted: "#9CA3AF",
        },
        accent: {
          DEFAULT: "#F0C239",
          soft: "#FDF6DC",
          ink: "#17171A",
        },
        secondary: {
          DEFAULT: "#2F5FE0",
          soft: "#EAF0FE",
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
