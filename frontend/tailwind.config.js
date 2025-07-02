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
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                // Research-specific palette — deep navy/slate instead of GPT gray
                ra: {
                    bg: '#0F1117',        // Deep navy background
                    surface: '#161822',    // Card/surface
                    sidebar: '#0B0D14',    // Sidebar dark
                    input: '#1C1F2E',      // Input field
                    border: '#252840',     // Borders
                    text: '#E2E4ED',       // Primary text
                    muted: '#6B7194',      // Muted/secondary text
                    accent: '#6C5CE7',     // Primary purple accent
                    accentLight: '#A29BFE', // Light purple
                    success: '#00B894',    // Green for success/done
                    warning: '#FDCB6E',    // Yellow for warnings
                    info: '#74B9FF',       // Blue for info
                    error: '#FF6B6B',      // Red for errors
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
