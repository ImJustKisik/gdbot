/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        outline: 'var(--color-outline)'
      },
      boxShadow: {
        card: '0 20px 45px -24px rgba(15,23,42,0.45)'
      }
    },
  },
  plugins: [],
}
