import { defineConfig } from "vite";

export default defineConfig({
    root: "public",
    build: {
        outDir: "../dist/public",
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        proxy: {
            "/socket.io": { target: "ws://localhost:8000", ws: true },
        },
    },
});
