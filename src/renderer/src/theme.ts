import { createTheme, type MantineColorsTuple } from '@mantine/core'

// Weavit UI's visual identity.
//
// Direction: this is a tool for looking at *data*, so the data is the hero —
// rendered in a crisp monospace throughout — while the chrome stays quiet in
// the native system UI face. Surfaces are a refined deep slate (not Mantine's
// default blue-grey), and the one loud element is the per-connection accent
// color, which the app injects at runtime. The static accent below (aqua) is
// only used for neutral primary actions.

const aqua: MantineColorsTuple = [
  '#e3fbf6',
  '#c5f2e9',
  '#94e6d5',
  '#5fd8be',
  '#37ccab',
  '#1fc59f',
  '#0dc298',
  '#00a884',
  '#009675',
  '#008263'
]

// A cohesive deep-slate ramp: warmer and quieter than the stock dark palette,
// so panels read as one considered surface rather than default chrome.
const slate: MantineColorsTuple = [
  '#c7ccd6',
  '#b6bcc8',
  '#98a0b0',
  '#6c7484',
  '#3b414d',
  '#2a2f39',
  '#1e222b',
  '#161922',
  '#10131a',
  '#0b0d12'
]

export const theme = createTheme({
  primaryColor: 'aqua',
  colors: { aqua, dark: slate },
  primaryShade: { light: 6, dark: 5 },
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '1.6rem', lineHeight: '1.2' },
      h2: { fontSize: '1.3rem' },
      h3: { fontSize: '1.1rem' },
      h4: { fontSize: '0.95rem' }
    }
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  fontSizes: {
    xs: '0.72rem',
    sm: '0.82rem',
    md: '0.9rem',
    lg: '1rem',
    xl: '1.15rem'
  }
})
