// electron-vite resolves `?asset` imports to a runtime file path (dev + prod).
declare module '*?asset' {
  const path: string
  export default path
}
