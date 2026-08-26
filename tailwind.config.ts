import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0714",
        brand: {
          50: "#f4edff",
          100: "#e8d9ff",
          500: "#9b5cff",
          600: "#7c3aed",
          700: "#6d28d9",
          900: "#2e1065"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.28), 0 16px 40px rgba(12,7,28,.34)"
      }
    },
  },
  plugins: [forms],
} satisfies Config;
