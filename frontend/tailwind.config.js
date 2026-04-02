import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"IBM Plex Sans"', '"Avenir Next"', '"Segoe UI"', 'sans-serif'],
                serif: ['"Iowan Old Style"', '"Palatino Linotype"', '"Book Antiqua"', 'serif'],
                mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'monospace'],
            },
            colors: {
                ra: {
                    bg: '#07131a',
                    surface: '#0f2029',
                    surfaceRaised: '#17303a',
                    sidebar: '#081019',
                    input: '#10242d',
                    border: '#24424d',
                    text: '#e6f0ef',
                    muted: '#8ea7aa',
                    accent: '#6fc7bd',
                    accentLight: '#b7e4dc',
                    success: '#5fd19b',
                    warning: '#f2c572',
                    info: '#8ac2ff',
                    error: '#ff8a7a',
                }
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'slide-up': 'slideUp 0.3s ease-out',
                'fade-in': 'fadeIn 0.4s ease-out',
                'shimmer': 'shimmer 2s infinite linear',
            },
            keyframes: {
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
            },
        },
    },
    plugins: [typography],
}
