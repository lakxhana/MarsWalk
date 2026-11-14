/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Rubik Variable"', 'Rubik', 'system-ui', 'sans-serif'],
        serif: ['"Rubik Variable"', 'Rubik', 'system-ui', 'sans-serif'],
        mono: ['"Rubik Variable"', 'Rubik', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
