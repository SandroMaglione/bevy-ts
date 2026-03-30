import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pixi: "pixi.html",
        "top-down": "top-down.html"
      }
    }
  },
  server: {
    open: "/pixi.html"
  }
})
