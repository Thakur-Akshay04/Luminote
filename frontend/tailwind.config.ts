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
        sans: [
          "Nunito",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Fira Sans",
          "Droid Sans",
          "Helvetica Neue",
          "sans-serif"
        ],
        display: [
          "Quicksand",
          "Nunito",
          "sans-serif"
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        xs: "12px",
        sm: "13.01px",
        base: "13.008px",
        md: "14px",
        lg: "15px",
        xl: "18px",
      },
      spacing: {
        "space-1": "2px",
        "space-2": "4px",
        "space-3": "6px",
        "space-4": "8px",
        "space-5": "12px",
        "space-6": "14px",
        "space-7": "15px",
        "space-8": "40px",
      },
      borderRadius: {
        "radius-xs": "4px",
        "radius-sm": "9999px",
        xs: "4px",
        sm: "9999px",
      },
      transitionDuration: {
        instant: "100ms",
      },
      colors: {
        text: {
          primary: "#f4f4f5",
          secondary: "#a1a1aa",
          tertiary: "#71717a",
          inverse: "#09090b",
        },
        surface: {
          base: "#09090b",
          raised: "#18181b",
          strong: "#27272a",
          900: "#18181b", // raised card/sidebar
          800: "#09090b", // base background
          700: "#27272a", // strong (hover states)
          600: "#27272a", // border muted
          500: "#71717a", // tertiary text
        },
        border: {
          muted: "#27272a",
        },
        brand: {
          50:  "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c084fc",
          400: "#a855f7",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        accent: {
          violet: "#8b5cf6",
          cyan:   "#06b6d4",
          pink:   "#db2777",
          amber:  "#f59e0b",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-gradient":
          "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
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
        glass: "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        glow:  "none",
        "glow-sm": "none",
      },
    },
  },
  plugins: [],
};

export default config;
