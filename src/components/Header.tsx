import { useState } from 'react';
import { formatSimLMST } from '@/lib/commManager';

export type AppView = 'plan' | 'walk' | 'notebook' | 'science' | 'globe' | 'sources' | 'missions';
export type UserRole = 'explorer' | 'science_team';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  role: UserRole;
  onChangeRole: (role: UserRole) => void;
  simTime: number;
  simulationPaused: boolean;
  missionActive: boolean;
  missionReady?: boolean;
  onToggleSimulation: () => void;
  oneWayDelayMinutes: number;
  onSetOneWayDelayMinutes: (minutes: number) => void;
  onAdvanceSimTime: (seconds: number) => void;
  simulationSpeedMultiplier: number;
  onSetSimulationSpeedMultiplier: (multiplier: number) => void;
  statusUpdateIntervalSeconds: number;
  onSetStatusUpdateIntervalSeconds: (seconds: number) => void;
}

export default function Header({ currentView, onNavigate, role, onChangeRole, simTime,
  oneWayDelayMinutes, onSetOneWayDelayMinutes, simulationSpeedMultiplier, onSetSimulationSpeedMultiplier, missionActive, missionReady=false }: HeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary: {id: AppView; label: string}[] = role === 'explorer'
    ? [{id: 'globe', label: 'Explore Mars'}, {id: 'plan', label: missionReady?'Missions · ready':'Missions'}, {id: 'missions', label: 'Mission log'}]
    : [{id:'globe',label:'Explore Mars'},{id:'plan',label:'Plan mission'},...(missionActive?[{id:'science' as AppView,label:'Mission control'}]:[]),{id:'missions',label:'Mission log'}];
  return <header className="mission-header">
    <div className="mission-brand"><span className="brand-orbit" aria-hidden="true"/><strong>MARSWALK</strong><span className="prototype-label">Research simulation · 1.9.9</span></div>
    <nav aria-label="Main navigation" className="mission-nav">
      {primary.map(item => <button key={item.id} className={item.id==='plan'&&role==='explorer'&&missionReady?'mission-ready':''} aria-current={currentView === item.id ? 'page' : undefined} onClick={() => {setMoreOpen(false);onNavigate(item.id);}}>{item.label}</button>)}
    </nav>
    <div className="mission-tools">{oneWayDelayMinutes===0&&simulationSpeedMultiplier>1&&<span className="demo-speed-badge">DEMO {simulationSpeedMultiplier}×</span>}{missionActive&&currentView!=='walk'&&role==='explorer'&&<button className="quiet-button" onClick={()=>onNavigate('walk')}>Return to active walk</button>}
      <label className="sr-only" htmlFor="workspace">Workspace</label>
      <select id="workspace" value={role} onChange={e => {setMoreOpen(false);onChangeRole(e.target.value as UserRole);}}><option value="explorer">Mars crew</option><option value="science_team">Earth team</option></select>
      <div className="relative"><button aria-label="More options" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="quiet-button">•••</button>
      {moreOpen && <div className="workspace-menu">
        <button onClick={() => {onNavigate('globe'); setMoreOpen(false);}}>Explore Mars globe</button>
        <button onClick={() => {onNavigate('notebook'); setMoreOpen(false);}}>Field log</button>
        <button onClick={() => {onNavigate('sources'); setMoreOpen(false);}}>Data & coverage</button>
        <label>Mission mode<select aria-label="Communication mode" value={oneWayDelayMinutes>0?'delay':simulationSpeedMultiplier>1?'fast':'live'} onChange={e=>{if(e.target.value==='delay')onSetOneWayDelayMinutes(5);else onSetSimulationSpeedMultiplier(e.target.value==='fast'?5:1);}}><option value="live">Live · 1×</option><option value="delay">Mars delay · 1×</option><option value="fast">Fast demo · 5×</option></select></label><p>{formatSimLMST(simTime)} · {oneWayDelayMinutes} min signal delay</p>
        <p>Shared mission database</p>
      </div>}</div>
    </div>
  </header>;
}
