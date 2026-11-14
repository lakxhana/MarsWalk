// One simulator, many viewers. Commands and snapshots commit together in SQLite.
export function createSession(db, now=()=>Date.now()) {
 let owner=null,expires=0;
 return {
  poll({clientId,state,ack=[]}) {
   if(typeof clientId!=='string'||clientId.length<8||clientId.length>100)throw new Error('Invalid client');
   const time=now();
   let claimed=false;
   if(owner!==clientId&&(!owner||time>=expires)){owner=clientId;claimed=true;const saved=db.getMission();if(saved?.missionStartedAtSimTime!=null)db.saveMission({...saved,simulationPaused:true,restorePending:true});}
   if(owner===clientId){expires=time+30000;if(state&&!claimed)db.commitSession(state,ack);}
   return {controller:owner===clientId,claimed,mission:db.getMission(),commands:owner===clientId?db.getCommands():[]};
  },
  enqueue(command){db.enqueueCommand(command);return {ok:true};}
 };
}
