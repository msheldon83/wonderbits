import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { PerfPage } from './perf/PerfPage';
import './styles.css';

const isPerf = new URLSearchParams(location.search).has('perf');

createRoot(document.getElementById('root')!).render(<StrictMode>{isPerf ? <PerfPage /> : <App />}</StrictMode>);
