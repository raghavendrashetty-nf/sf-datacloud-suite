import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  safelist: [
    { pattern: /(bg|text|border|ring|from|to)-(sky|indigo|rose|violet|emerald|amber|slate|cyan|teal)-(50|100|200|300|400|500|600|700|800|900)/ }
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
export default config;
