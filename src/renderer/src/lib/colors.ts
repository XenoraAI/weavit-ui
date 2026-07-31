// Environment accent colors. Each connection can carry one; it threads through
// the sidebar rail and the status bar so you always know which instance you're
// pointed at — the app's one deliberately loud element.
export interface EnvColor {
  name: string
  hex: string
}

export const ENV_COLORS: EnvColor[] = [
  { name: 'Aqua', hex: '#0dc298' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Slate', hex: '#64748b' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Cyan', hex: '#06b6d4' }
]

export const DEFAULT_ENV_COLOR = ENV_COLORS[0].hex

export function connColor(color?: string): string {
  return color || DEFAULT_ENV_COLOR
}
