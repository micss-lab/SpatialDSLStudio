declare module '@uiw/react-codemirror' {
  import React from 'react';

  export interface ReactCodeMirrorRef {
    view?: any; // CodeMirror EditorView
    state?: any;
    editor?: HTMLDivElement | null;
  }

  interface CodeMirrorProps {
    value?: string;
    height?: string;
    width?: string;
    extensions?: any[];
    onChange?: (value: string) => void;
    theme?: string;
    className?: string;
    [key: string]: any;
  }

  const CodeMirror: React.ForwardRefExoticComponent<CodeMirrorProps & React.RefAttributes<ReactCodeMirrorRef>>;
  export default CodeMirror;
}

declare module '@codemirror/lang-javascript' {
  export function javascript(): any;
} 