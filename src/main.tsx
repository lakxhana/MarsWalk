import { createRoot } from 'react-dom/client';
import App, { type PersistedMissionState } from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { getStoredMission } from './lib/storage';
import '@fontsource-variable/rubik';
import './index.css';
import {ApiRequestError} from './lib/apiClient';

const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    root.render(<div className="p-8">Opening mission database…</div>);
    const mission = await getStoredMission<PersistedMissionState>();
    root.render(<ErrorBoundary><App initialMission={mission} shared/></ErrorBoundary>);
  } catch(error) {
    const signIn = error instanceof ApiRequestError && error.status === 401;
    const local = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
    root.render(<main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl">{signIn ? 'Open shared mission' : 'Could not open the mission database'}</h1>
      <p className="my-4">{error instanceof Error ? error.message : 'Connection failed.'}</p>
      {signIn ? <a className="primary-button" href="/api/login">Sign in</a> : <>
        {local && <p className="my-4">Run npm start and keep its terminal open.</p>}
        <button className="primary-button" onClick={() => void start()}>Retry connection</button>
      </>}
    </main>);
  }
}
void start();
