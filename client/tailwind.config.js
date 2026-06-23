/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.03)',
          elevated: 'rgba(255,255,255,0.06)',
        },
        neon: {
          cyan: '#22d3ee',
          blue: '#06b6d4',
          purple: '#8b5cf6',
          pink: '#a78bfa',
          green: '#34d399',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'premium': '0 4px 24px rgba(0, 0, 0, 0.35)',
        'premium-lg': '0 8px 40px rgba(0, 0, 0, 0.45)',
        'glow': '0 4px 20px rgba(34, 211, 238, 0.25)',
        'glow-purple': '0 4px 20px rgba(139, 92, 246, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'scan': 'scan 3s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'matrix': 'matrix 20s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.2)' },
          '100%': { boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.1)' }
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        matrix: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      backgroundImage: {
        'cyber-grid': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        'neon-gradient': 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
        'premium-gradient': 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)',
      }
    }
  },
  plugins: []
};
