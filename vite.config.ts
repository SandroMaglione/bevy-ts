import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pixi: "examples/pixi/index.html",
        platformer: "examples/platformer/index.html",
        "top-down": "examples/top-down/index.html"
      }
    }
  },
  server: {
    open: "/examples/pixi/"
  }
})
