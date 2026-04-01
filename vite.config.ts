import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pixi: "pixi.html",
        platformer: "platformer.html",
        "top-down": "top-down.html"
      }
    }
  },
  server: {
    open: "/pixi.html"
  }
})
