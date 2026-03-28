import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pixi: "pixi.html"
      }
    }
  },
  server: {
    open: "/pixi.html"
  }
})
