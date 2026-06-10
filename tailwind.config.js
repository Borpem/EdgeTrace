/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ui)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-data)"]
      },
      colors: {
        graphite: "#03060C",
        panel: "#0B111C",
        line: "#223047",
        ink: "#F7F7F3",
        muted: "#9B9B95",
        accent: "#4F8CFF",
        cyan: "#58D6FF",
        violet: "#7861FF",
        profit: "#3DDC97",
        warning: "#FFB84D",
        loss: "#D92D50"
      }
    }
  },
  plugins: []
};
