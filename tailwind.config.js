/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{jsx,js}'
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        sub: 'var(--sub)',
        ink: 'var(--ink)',
        mut: 'var(--mut)',
        line: 'var(--line)',
        acc: 'var(--acc)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      borderRadius: {
        card: '18px',
        btn: '12px'
      },
      keyframes: {
        up: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' }
        },
        sh: {
          to: { backgroundPosition: '-200% 0' }
        }
      },
      animation: {
        fade: 'up 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'sh 1.4s linear infinite'
      }
    }
  },
  plugins: []
};
