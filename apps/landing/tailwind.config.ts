import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        ink: "hsl(var(--ink))",
        "ink-soft": "hsl(var(--ink-soft))",
        paper: "hsl(var(--paper))",
        "paper-deep": "hsl(var(--paper-deep))",
        marigold: "hsl(var(--marigold))",
        "marigold-deep": "hsl(var(--marigold-deep))",
        saffron: "hsl(var(--saffron))",
        teal: "hsl(var(--teal))",
        "teal-deep": "hsl(var(--teal-deep))",
        whatsapp: "hsl(var(--whatsapp))",
        "whatsapp-bubble": "hsl(var(--whatsapp-bubble))",
        aadhaar: "hsl(var(--aadhaar))",
        "gov-blue": "hsl(var(--gov-blue))",
        chaos: "hsl(var(--chaos))",
        confidence: "hsl(var(--confidence))",
        sticky: "hsl(var(--sticky))",
        highlight: "hsl(var(--highlight))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      backgroundImage: {
        "gradient-control": "var(--gradient-control)",
        "gradient-chaos": "var(--gradient-chaos)",
        "gradient-confidence": "var(--gradient-confidence)",
        "gradient-marigold": "var(--gradient-marigold)",
      },
      boxShadow: {
        paper: "var(--shadow-paper)",
        lift: "var(--shadow-lift)",
        sticky: "var(--shadow-sticky)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "pulse-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.15)", opacity: "0" },
        },
        "drift": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "flow": {
          "0%": { strokeDashoffset: "40" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 2.4s ease-out infinite",
        "drift": "drift 5s ease-in-out infinite",
        "flow": "flow 2s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
