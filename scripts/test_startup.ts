import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { strict as assert } from 'node:assert';
import App from '../src/App';
for (const saved of [null, {view:'plan', role:'explorer', missionStartedAtSimTime:null}, {view:'walk',role:'explorer',missionStartedAtSimTime:52000}, {view:'science',role:'science_team',missionStartedAtSimTime:52000}]) {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved ? JSON.stringify({...saved,simTime:52200,surfacePose:{x:0,z:0,yaw:0,pitch:0}}) : null}});
  const html = renderToString(createElement(App));
  assert.match(html,/Loading Mars globe/);
  assert.match(html,/aria-current="page">Explore Mars/);
  assert.doesNotMatch(html,/data-test-view="MarsPlan"/);
  console.log(`PASS globe-first startup with ${saved?.view ?? 'no'} saved view`);
}
