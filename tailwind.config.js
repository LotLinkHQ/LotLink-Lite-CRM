/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#0B5E7E",
        secondary: "#E67E22",
        success: "#27AE60",
        warning: "#F39C12",
        error: "#E74C3C",
        background: "#F8F9FA",
        surface: "#FFFFFF",
        foreground: "#2C3E50",
        muted: "#7F8C8D",
        border: "#ECF0F1",
      },
    },
  },
  plugins: [],
};
