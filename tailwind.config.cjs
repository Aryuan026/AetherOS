/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.tsx',
    './apps/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './context/**/*.{js,ts,jsx,tsx}',
    './domain/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font)', 'sans-serif'],
      },
      colors: {
        primary: 'hsl(var(--primary-hue), var(--primary-sat), var(--primary-lightness))',
        'primary-focus': 'hsl(var(--primary-hue), var(--primary-sat), calc(var(--primary-lightness) - 10%))',
        'primary-light': 'hsl(var(--primary-hue), var(--primary-sat), 92%)',
        surface: 'rgba(255, 255, 255, 0.75)',
        'surface-glass': 'rgba(255, 255, 255, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-down': 'slideDown 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
        'pop-in': 'popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'float-up': 'floatUp 3s ease-out forwards',
        wiggle: 'wiggle 0.5s ease-in-out infinite',
        'bounce-slow': 'bounceSlow 2s ease-in-out infinite',
        float: 'floatDrift 4s ease-in-out infinite alternate',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        shimmer: 'shimmer 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.97) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '60%': { transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        floatUp: {
          '0%': { opacity: '1', transform: 'translateY(100vh) scale(1)' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-50px) scale(1.5)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'translate(-50%, -100%) rotate(-3deg)' },
          '50%': { transform: 'translate(-50%, -100%) rotate(3deg)' },
        },
        bounceSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        floatDrift: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0.3' },
          '100%': { transform: 'translateY(-30px) scale(1.1)', opacity: '0.6' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(139, 92, 246, 0.15)' },
          '50%': { boxShadow: '0 0 25px rgba(139, 92, 246, 0.3)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
