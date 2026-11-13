import { useState } from 'react';
import { formatSimLMST } from '@/lib/commManager';

export type AppView = 'plan' | 'walk' | 'notebook' | 'science' | 'globe' | 'sources';
export type UserRole = 'explorer' | 'science_team';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  role: UserRole;
  onChangeRole: (role: UserRole) => void;
  simTime: number;
  simulationPaused: boolean;
  missionActive: boolean;
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
  oneWayDelayMinutes, onSetOneWayDelayMinutes }: HeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary: {id: AppView; label: string}[] = role === 'explorer'
    ? [{id: 'globe', label: 'Explore Mars'}, {id: 'plan', label: 'Plan route'}, {id: 'walk', label: 'Walk'}, {id: 'notebook', label: 'Field log'}]
    : [{id:'plan',label:'Plan mission'},{id: 'science', label: 'Mission support'}];
  return <header className="mission-header">
    <div className="mission-brand"><span className="brand-orbit" aria-hidden="true"/><strong>MARSWALK</strong><span className="prototype-label">Research simulation · 1.5.4</span></div>
    <nav aria-label="Main navigation" className="mission-nav">
      {primary.map(item => <button key={item.id} aria-current={currentView === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}
    </nav>
    <div className="mission-tools">
      <label className="sr-only" htmlFor="workspace">Workspace</label>
      <select id="workspace" value={role} onChange={e => onChangeRole(e.target.value as UserRole)}><option value="explorer">Mars crew</option><option value="science_team">Earth team</option></select>
      <div className="relative"><button aria-label="More options" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="quiet-button">•••</button>
      {moreOpen && <div className="workspace-menu">
        <button onClick={() => {onNavigate('globe'); setMoreOpen(false);}}>Explore Mars globe</button>
        <button onClick={() => {onNavigate('sources'); setMoreOpen(false);}}>Data & coverage</button>
        <label>Communication<select aria-label="Communication mode" value={oneWayDelayMinutes===0?0:5} onChange={e=>onSetOneWayDelayMinutes(Number(e.target.value))}><option value={0}>Live demo · no delay</option><option value={5}>Mars delay · 5 min</option></select></label><p>{formatSimLMST(simTime)} · {oneWayDelayMinutes} min signal delay</p>
        <p>SQLite saved · roles share this session.</p>
      </div>}</div>
    </div>
  </header>;
}
