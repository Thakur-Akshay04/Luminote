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
        sans: ["var(--font-sans)", "DM Sans", "sans-serif"],
        display: ["var(--font-sans)", "DM Sans", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "Roboto Mono", "monospace"],
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
        theme: "var(--radius)",
      },
      transitionDuration: {
        instant: "100ms",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
        text: {
          primary: "var(--foreground)",
          secondary: "var(--muted-foreground)",
          tertiary: "#78716c",
          inverse: "var(--primary-foreground)",
        },
        surface: {
          base: "var(--background)",
          raised: "var(--sidebar)",
          strong: "var(--sidebar-accent)",
          900: "var(--sidebar)",
          800: "var(--background)",
          700: "var(--sidebar-accent)",
          600: "var(--popover)",
          500: "var(--muted-foreground)",
        },
        border: {
          DEFAULT: "var(--border)",
          muted: "var(--sidebar-border)",
        },
        brand: {
          50:  "#fff8eb",
          100: "#ffedd1",
          200: "#fcd79f",
          300: "#f9a748",
          400: "#f9a748",
          500: "#f58c24",
          600: "#d97316",
          700: "#b4590f",
          800: "#8f4412",
          900: "#733812",
          950: "#1a0f05",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
          violet: "#f58c24",
          cyan:   "#1faab7",
          pink:   "#f9a748",
          amber:  "#e3af35",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-gradient":
          "linear-gradient(135deg, var(--background) 0%, var(--sidebar) 100%)",
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
