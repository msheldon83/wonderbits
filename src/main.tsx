import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './account/Root';
import { ACCOUNTS } from './sync/api';
import { PerfPage } from './perf/PerfPage';
import './styles.css';

const isPerf = new URLSearchParams(location.search).has('perf');

createRoot(document.getElementById('root')!).render(<StrictMode>{isPerf ? <PerfPage /> : <Root accounts={ACCOUNTS} />}</StrictMode>);
