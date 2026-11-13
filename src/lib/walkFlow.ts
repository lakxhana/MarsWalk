export type WalkMode = 'manual' | 'following' | 'clickToWalk' | 'paused' | 'investigating';
export function initialWalkMode(active:boolean, arrived:boolean, savedMode?:WalkMode):WalkMode {
  if(!active || arrived) return 'paused';
  // Click targets are transient and must not be silently resumed after reload.
  if(savedMode === 'investigating' || savedMode === 'paused' || savedMode === 'manual' || savedMode === 'clickToWalk') return 'paused';
  return 'following';
}
export function hasReachedDestination(remaining:number, endpointDistance:number):boolean {
  return remaining <= 1 && endpointDistance <= 1.5;
}
export function resumeWalkMode(arrived:boolean):WalkMode {return arrived ? 'paused' : 'following';}
export function reportedMovement(mode:WalkMode, clockPaused:boolean, recording:boolean, returning:boolean, manualMoving:boolean) {
  if(clockPaused)return 'Stopped' as const;
  if(recording)return 'Recording' as const;
  if(mode === 'investigating')return 'Investigating' as const;
  const moving=mode==='following'||mode==='clickToWalk'||(mode==='manual'&&manualMoving);
  return moving ? returning ? 'Returning' as const : 'Walking' as const : 'Stopped' as const;
}
