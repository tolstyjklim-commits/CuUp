import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset paths work both on GitHub Pages project sites and local preview.
export default defineConfig({ base: './', plugins: [react()] })
