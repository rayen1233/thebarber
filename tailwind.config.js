/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "split-shine-v": {
          "0%": { backgroundPosition: "0% -30%" },
          "100%": { backgroundPosition: "0% 130%" },
        },
        "split-shine-h": {
          "0%": { backgroundPosition: "-30% 0%" },
          "100%": { backgroundPosition: "130% 0%" },
        },
        "split-cta-shine": {
          "0%": {
            transform: "translateX(-130%) skewX(-12deg)",
            opacity: "0.25",
          },
          "18%": { opacity: "1" },
          "100%": {
            transform: "translateX(220%) skewX(-12deg)",
            opacity: "0",
          },
        },
      },
      animation: {
        "split-shine-v": "split-shine-v 2.8s linear infinite",
        "split-shine-h": "split-shine-h 2.8s linear infinite",
        "split-cta-shine": "split-cta-shine 0.85s cubic-bezier(0.22,0.08,0.18,1) forwards",
      },
      colors: {
        gold: {
          DEFAULT: "#c9a227",
          light: "#e8d48b",
          dark: "#8a7019",
        },
      },
      fontFamily: {
        display: ["system-ui", "Segoe UI", "sans-serif"],
        hero: [
          '"Cormorant Garamond"',
          "ui-serif",
          "Georgia",
          "Cambria",
          "serif",
        ],
        cinema: [
          '"Playfair Display"',
          '"Cormorant Garamond"',
          "ui-serif",
          "Georgia",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
