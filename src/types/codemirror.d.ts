declare module '@uiw/react-codemirror' {
  import React from 'react';
  
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
  
  const CodeMirror: React.ComponentType<CodeMirrorProps>;
  export default CodeMirror;
}

declare module '@codemirror/lang-javascript' {
  export function javascript(): any;
} 