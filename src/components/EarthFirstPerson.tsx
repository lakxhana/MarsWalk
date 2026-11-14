import {useMemo} from 'react';
import type {MissionStatusSnapshot} from '@/lib/storage';
import {receivedWalkRoute} from '@/lib/missionControl';
import WalkScene from './WalkScene';

export default function EarthFirstPerson({status,paused,onMap}:{status:MissionStatusSnapshot|null;paused:boolean;onMap:()=>void}){
 const path=JSON.stringify(status?.plannedRoutePoints??[]),id=`${status?.missionId??''}:${status?.planVersion??0}`,mode=status?.mapMode;
 const route=useMemo(()=>receivedWalkRoute(JSON.parse(path),id,mode),[path,id,mode]);
 if(!status||!route)return <div className="control-empty"><strong>{status?'3D route unavailable':'Waiting for crew position'}</strong><button onClick={onMap}>2D map</button></div>;
 return <WalkScene route={route} pose={{...status.position,yaw:status.headingRadians??0,pitch:0,routeDist:status.routeDistanceMeters}} walking={!paused&&status.movementState==='Walking'} visible onMap={onMap}/>;
}
