/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],

  // ✅ Content paths — Tailwind yahan se scan karega
  // Sirf ye files mein jo classes use hain wahi CSS mein aayengi
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],

  // ✅ Future flags — Tailwind v4 ke liye ready
  future: {
    hoverOnlyWhenSupported: true,
  },

  theme: {
    extend: {
      // ✅ Font family — ek jagah define kar do
      fontFamily: {
        hindi: [
          'Noto Sans Devanagari',
          'Inter',
          'system-ui',
          '-apple-system',
          'sans-serif'
        ],
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'sans-serif'
        ],
      },

      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },

      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        // ✅ Marquee animation Tailwind mein define
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        // ✅ Marquee Tailwind class se use kar sako
        marquee: "marquee 30s linear infinite",
      },
    },
  },

  plugins: [
    require('@tailwindcss/typography'),
    require("tailwindcss-animate")
  ],
}
