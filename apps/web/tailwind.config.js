/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        naka: {
          canvas: '#FFFFFF',
          surface: '#FAFAFA',
          subtle: '#F2F2F2',
          border: '#E5E5E5',
          'border-light': '#F0F0F0',
          dark: '#121212',
          'dark-surface': '#191919',
          'dark-card': '#212121',
          'dark-border': '#2E2E2E',
          orange: '#EB6324',
          'orange-hover': '#D45319',
          'orange-subtle': 'rgba(235, 99, 36, 0.08)',
          'orange-glow': 'rgba(235, 99, 36, 0.25)',
          green: '#10B981',
          'green-subtle': 'rgba(16, 185, 129, 0.1)',
          volt: '#C2FA1F',
          muted: '#737373',
          'dark-muted': '#A1A1AA',
        },
        obsidian: {
          950: '#0C0D0E',
          900: '#121212',
          850: '#161719',
          800: '#191919',
          card: '#1E1E1E',
          border: '#2A2A2A',
          'border-light': '#383838',
          subtle: '#8E8E93',
          muted: '#737373',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Fragment Mono"', '"Kode Mono"', 'monospace'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'flow-line': 'flowLine 3s linear infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        flowLine: {
          '0%': { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
      },
    },
  },
  plugins: [],
};
