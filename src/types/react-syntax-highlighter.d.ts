declare module 'react-syntax-highlighter' {
  import React from 'react';
  const SyntaxHighlighter: React.ComponentType<{
    language?: string;
    style?: any;
    children: string;
    className?: string;
    [key: string]: any;
  }>;
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/styles/hljs' {
  export const docco: any;
} 