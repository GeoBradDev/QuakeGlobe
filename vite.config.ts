/// <reference types="vitest/config" />
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {viteStaticCopy} from 'vite-plugin-static-copy'
import {resolve} from 'path'

// Cesium loads its web workers, third-party libraries, assets and widget styles
// at runtime from CESIUM_BASE_URL. Copy them from the installed package so they
// are served at /cesium in dev and emitted to dist/cesium on build.
const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesium'

export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
                src: `${cesiumSource}/${dir}`,
                dest: cesiumBaseUrl,
                // Drop the node_modules/cesium/Build/Cesium prefix, keep <dir>/...
                rename: {stripBase: 4},
            })),
        }),
    ],
    base: '/',
    define: {
        CESIUM_BASE_URL: JSON.stringify('/cesium'),
    },
    resolve: {
        alias: {
            cesium: resolve(__dirname, 'node_modules/cesium'),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
    },
})
