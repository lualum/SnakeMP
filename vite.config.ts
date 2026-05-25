import { defineConfig } from "vite";

export default defineConfig({
    root: "public",
    build: {
        outDir: "../dist/public",
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        allowedHosts: true,
        proxy: {
            "/ws": {
                target: "ws://localhost:8000",
                ws: true,
                changeOrigin: true,
            },
        },
    },
});
