/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rain: { DEFAULT: "#3b82f6", light: "#93c5fd", dark: "#1d4ed8" },
      },
    },
  },
  plugins: [],
};
