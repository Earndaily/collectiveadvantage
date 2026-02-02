// =============================================================
// tailwind.config.ts
// =============================================================

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161923',
          hover:  '#1e2333',
        },
        border: '#2a3042',
        accent: {
          DEFAULT: '#f0a832',
          dim:     '#c88a1a',
        },
        success: '#34d399',
        error:   '#fb7185',
        info:    '#60a5fa',
        text: {
          primary: '#e8eaf0',
          secondary: '#8891a5',
        },
      },
      borderRadius: {
        card: '1rem',
        btn:  '0.75rem',
      },
    },
  },
  plugins: [],
};

export default config;
