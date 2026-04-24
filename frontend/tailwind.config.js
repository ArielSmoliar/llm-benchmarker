/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0effe',
          100: '#e4e1fd',
          200: '#ccc6fb',
          300: '#a99af7',
          400: '#8570f3',
          500: '#7c6af7',
          600: '#5a3ef0',
          700: '#4b2edd',
          800: '#3e26b9',
          900: '#352397',
          950: '#201464',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
