/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background:         "#0d0e24",
        card:               "#171b2e",
        muted:              "#1e2535",
        accent:             "#23293c",
        border:             "#2a3148",
        foreground:         "#f5f7fb",
        "muted-foreground": "#acb1c0",
        input:              "#1e2535",
        primary: {
          DEFAULT:    "#ff9500",
          foreground: "#0d0e24",
        },
        success:     "#27db9a",
        info:        "#39adff",
        warning:     "#f9b821",
        destructive: "#ff5c5c",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        chat: ["IBM Plex Sans", "ui-sans-serif", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
