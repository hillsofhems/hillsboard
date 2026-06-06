/** @type {import('tailwindcss').Config} */
// Design-System "Hills of Hems Hub"
// Warme, natürliche Palette (gebrochenes Weiß, Sand/Beige), Akzent Salbeigrün +
// Terrakotta. Ruhig & redaktionell – inspiriert von Notion (Klarheit, Whitespace)
// und monday.com (farbige Status). Dezente Borders statt harter Schatten.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Hintergründe & Flächen – warmes Papier statt kaltem Weiß
        paper: '#FAF8F3', // App-Hintergrund (gebrochenes Weiß)
        surface: '#FFFFFF', // Karten / Panels
        sand: {
          50: '#F7F3EC',
          100: '#F0EADF',
          200: '#E6DDCD',
          300: '#D8CCB6',
          400: '#C3B295',
        },
        // Warmes Near-Black + abgestufte gedämpfte Grautöne (warm getönt)
        ink: {
          DEFAULT: '#2B2722',
          soft: '#4A4339',
          muted: '#7A7062',
          faint: '#A89E8E',
        },
        line: '#E8E0D3', // dezente Standard-Border
        'line-strong': '#DACFBC',
        // Primärer Akzent: gedämpftes Salbeigrün
        sage: {
          50: '#F2F4EE',
          100: '#E3E8DA',
          200: '#C8D2B7',
          300: '#A7B690',
          400: '#879A6C',
          500: '#6E8253', // Haupt-Akzent
          600: '#586A42',
          700: '#465435',
        },
        // Sekundärer Akzent: Terrakotta (sparsam, für CTAs/Highlights)
        terracotta: {
          50: '#FBF1EC',
          100: '#F4DDD1',
          200: '#E8BBA4',
          300: '#D99470',
          400: '#CC7A52',
          500: '#B86440', // Haupt-Terrakotta
          600: '#9A5031',
        },
      },
      fontFamily: {
        // Lora (organische Serife) für Überschriften/Marke,
        // Inter (klar, sehr gut lesbar) für UI & Tabellen.
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        // Sanft abgerundete Ecken
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        // Sehr dezente Schatten – Tiefe vor allem über Borders
        card: '0 1px 2px rgba(43, 39, 34, 0.04)',
        panel: '0 8px 30px rgba(43, 39, 34, 0.10)',
        pop: '0 4px 16px rgba(43, 39, 34, 0.08)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-in-right': 'slide-in-right 200ms ease-out',
      },
    },
  },
  plugins: [],
}
