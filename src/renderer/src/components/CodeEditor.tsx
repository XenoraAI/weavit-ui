import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'

interface Props {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  height?: string
  placeholder?: string
}

// A dark JSON editor used for insert/edit forms and the raw consoles.
export function CodeEditor({ value, onChange, readOnly, height = '260px', placeholder }: Props) {
  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      readOnly={readOnly}
      placeholder={placeholder}
      extensions={[json()]}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: !readOnly }}
      onChange={onChange}
    />
  )
}
