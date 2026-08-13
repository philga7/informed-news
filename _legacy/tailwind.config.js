/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#D97757',
          hover: '#C86A4A',
        },
      },
      transitionDuration: {
        '250': '250ms',
      },
    },
  },
  plugins: [],
};
