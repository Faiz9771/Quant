import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SF Mono",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Premium display sizes — big, tight, confident.
        display: [
          "2rem",
          { lineHeight: "1.1", letterSpacing: "-0.035em", fontWeight: "600" },
        ],
        "display-lg": [
          "2.75rem",
          { lineHeight: "1.05", letterSpacing: "-0.04em", fontWeight: "600" },
        ],
        "display-sm": [
          "1.5rem",
          { lineHeight: "1.15", letterSpacing: "-0.03em", fontWeight: "600" },
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-soft": "hsl(var(--border-soft))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--surface-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          soft: "hsl(var(--brand-soft))",
          muted: "hsl(var(--brand-muted))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
        },
      },
      borderRadius: {
        "3xl": "24px",
        "2xl": "20px",
        xl: "14px",
        lg: "var(--radius)",
        md: "10px",
        sm: "6px",
      },
      boxShadow: {
        // Premium multi-layer shadows — Dribbble standard.
        xs: "0 1px 2px rgb(0 0 0 / 0.04)",
        sm: "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
        DEFAULT:
          "0 2px 8px -2px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)",
        md: "0 4px 16px -4px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        lg: "0 12px 32px -8px rgb(0 0 0 / 0.14), 0 4px 8px -4px rgb(0 0 0 / 0.04)",
        xl: "0 20px 48px -12px rgb(0 0 0 / 0.18), 0 8px 16px -8px rgb(0 0 0 / 0.06)",
        "2xl":
          "0 32px 64px -16px rgb(0 0 0 / 0.22), 0 12px 24px -12px rgb(0 0 0 / 0.08)",
        // Glass card shadow — layered with ring for depth.
        glass:
          "0 8px 32px -8px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06)",
        // Popover / dropdown float.
        pop: "0 16px 48px -12px rgb(0 0 0 / 0.20), 0 4px 12px -4px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.04)",
        // Focus / glow.
        glow: "0 0 0 2px hsl(var(--brand) / 0.35), 0 0 0 4px hsl(var(--brand) / 0.10)",
        // Inset shadows for depth.
        "inner-sm": "inset 0 1px 2px rgb(0 0 0 / 0.05)",
        "inner-white": "inset 0 1px 0 rgb(255 255 255 / 0.1)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1.2, 0.36, 1)",
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in-up": "fade-in-up 500ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 250ms cubic-bezier(0.22, 1.2, 0.36, 1)",
        "slide-down": "slide-down 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
