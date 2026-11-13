import { createRoot } from 'react-dom/client';
import App, { type PersistedMissionState } from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { getStoredMission, saveStoredMission, migrateLegacyNotebook } from './lib/storage';
import './index.css';

const root = createRoot(document.getElementById('root')!);
async function start() {
  try {
    root.render(<div className="p-8">Opening mission database…</div>);
    let mission = await getStoredMission<PersistedMissionState>();
    // Transfer old browser-only state once; SQLite takes priority thereafter.
    if(!mission) {
      const raw=localStorage.getItem('marswalk_mission_state_v1');
      if(raw) {const old=JSON.parse(raw);if(Number.isFinite(old.simTime) && Number.isFinite(old.surfacePose?.x) && Number.isFinite(old.surfacePose?.z)) {await saveStoredMission(old);mission=old;}}
    }
    await migrateLegacyNotebook();
    root.render(<ErrorBoundary><App initialMission={mission}/></ErrorBoundary>);
  } catch(error) {
    root.render(<main className="mx-auto max-w-lg p-8"><h1 className="text-xl">Could not open the mission database</h1><p className="my-4">{error instanceof Error ? error.message : 'Connection failed.'}</p><p className="my-4">Start this project with npm start and keep its terminal open. Your saved data has not been deleted.</p><button className="primary-button" onClick={() => void start()}>Retry connection</button></main>);
  }
}
// One active mission controller prevents two tabs advancing and overwriting the clock.
if(navigator.locks) {
  void navigator.locks.request('marswalk-mission-controller',{ifAvailable:true},async lock => {
    if(!lock){root.render(<main className="p-8"><h1>MARSWalk is already open in another tab</h1><p className="my-4">Use the Mars crew / Earth team selector in that tab, or close it and reload here.</p><button className="primary-button" onClick={()=>location.reload()}>Try again</button></main>);return;}
    await start();
    await new Promise<void>(()=>{});
  });
} else {void start();}
