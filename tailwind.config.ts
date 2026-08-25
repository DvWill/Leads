import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        brand: {
          50: "#eef8ff",
          100: "#d8efff",
          500: "#1788e5",
          600: "#0870c8",
          700: "#095aa1",
          900: "#0b365d"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.05), 0 8px 24px rgba(16,24,40,.04)"
      }
    },
  },
  plugins: [forms],
} satisfies Config;
