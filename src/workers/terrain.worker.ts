import {gentlerRoute,terrainStats} from '../lib/terrainAlternatives';
self.onmessage=({data})=>{try{const alternative=gentlerRoute(data.route,data.limit);self.postMessage({alternative,recordedStats:terrainStats(data.route),alternativeStats:alternative?terrainStats(alternative):null});}catch{self.postMessage({error:'Terrain comparison is unavailable for this route.'});}};
