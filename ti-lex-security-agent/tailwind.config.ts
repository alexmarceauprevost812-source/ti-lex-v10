import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Accent ti-lex
        tilex: {
          orange: "#ff6600",
          dark: "#0a0a0a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
