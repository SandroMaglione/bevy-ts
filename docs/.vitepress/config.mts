import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vitepress"

const sidebarPath = resolve(process.cwd(), "docs/api/typedoc-sidebar.json")

const apiSidebar = existsSync(sidebarPath)
  ? JSON.parse(readFileSync(sidebarPath, "utf8"))
  : []

export default defineConfig({
  title: "bevy-ts",
  description: "A type-safe, game-loop-agnostic ECS runtime for TypeScript.",
  base: "/bevy-ts/",
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "API", link: "/api/" },
      { text: "GitHub", link: "https://github.com/SandroMaglione/bevy-ts" }
    ],
    sidebar: {
      "/api/": apiSidebar
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/SandroMaglione/bevy-ts" }
    ],
    editLink: {
      pattern: "https://github.com/SandroMaglione/bevy-ts/edit/main/docs/:path",
      text: "Edit this page on GitHub"
    }
  }
})
