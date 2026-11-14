import { createRoot } from 'react-dom/client';
import App, { type PersistedMissionState } from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { getStoredMission } from './lib/storage';
import '@fontsource-variable/rubik';
import './index.css';

const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    root.render(<div className="p-8">Opening mission database…</div>);
    const mission = await getStoredMission<PersistedMissionState>();
    root.render(<ErrorBoundary><App initialMission={mission} shared/></ErrorBoundary>);
  } catch(error) {
    root.render(<main className="mx-auto max-w-lg p-8"><h1 className="text-xl">Could not open the mission database</h1><p className="my-4">{error instanceof Error ? error.message : 'Connection failed.'}</p><p className="my-4">Start this project with npm start and keep its terminal open. Your saved data has not been deleted.</p><button className="primary-button" onClick={() => void start()}>Retry connection</button></main>);
  }
}
void start();
