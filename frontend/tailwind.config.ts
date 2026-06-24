import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#e0e9ff",
          200: "#c2d3ff",
          300: "#94aeff",
          400: "#6183ff",
          500: "#4060f5",
          600: "#2f49eb",
          700: "#2538d8",
          800: "#2130ae",
          900: "#1f2d89",
          950: "#141c52",
        },
        surface: {
          900: "#0a0b14",
          800: "#0f1123",
          700: "#151829",
          600: "#1c2038",
          500: "#242847",
        },
        accent: {
          violet: "#7c3aed",
          cyan:   "#06b6d4",
          pink:   "#ec4899",
          amber:  "#f59e0b",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-gradient":
          "linear-gradient(135deg, #0a0b14 0%, #151829 40%, #1c2038 100%)",
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease-out",
        "slide-up":   "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow":  "spin 8s linear infinite",
        shimmer:      "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      boxShadow: {
        glass: "0 4px 32px rgba(64, 96, 245, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
        glow:  "0 0 24px rgba(64, 96, 245, 0.35)",
        "glow-sm": "0 0 12px rgba(64, 96, 245, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
