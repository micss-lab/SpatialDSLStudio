import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './template-theme.css'; // Import the new template theme
import App from './App';
import reportWebVitals from './reportWebVitals';
// Run migrations at startup
import './migrations/migrateConstraints';

// Add a console message to confirm index.tsx loaded the migration
console.log("Index.tsx: Migration import completed");

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
