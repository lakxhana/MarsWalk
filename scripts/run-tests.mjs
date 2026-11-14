import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'marswalk-tests-'));
try {
  for (const name of ['test_walk_readings','test_chat_sidebar','test_health_demo','test_mission_control','test_interface_recovery','test_health_support','test_mission_lifecycle','test_mission_timing', 'test_earth_monitoring', 'test_message_visibility', 'test_workspace_render', 'test_startup','test_walk_flow','test_crew_operations','test_field_walk','test_preflight','test_adaptive_planning','test_mission_revision','test_mission_handoff','test_app_journey','test_comparison_baseline','test_shared_clients']) {
    const outfile = join(dir, `${name}.cjs`);
    await build({tsconfig:'tsconfig.app.json', entryPoints:[`scripts/${name}.ts`], outfile, bundle:true, platform:'node', format:'cjs', plugins: ['test_app_journey','test_shared_clients'].includes(name) ? [{name:'globe-browser-surface',setup(b){b.onResolve({filter:/components\/MarsGlobe$/},()=>({path:'MarsGlobe',namespace:'globe-stub'}));b.onLoad({filter:/.*/,namespace:'globe-stub'},()=>({contents:'export default function Globe(){return null}',loader:'js'}));}}] : name === 'test_startup' ? [{name:'startup-view-stubs', setup(b) { b.onResolve({filter:/components\/(MarsGlobe|MarsPlan|MarsSurface|FieldNotebookView|EarthTeamMonitoring|SourcesAndCoverageView|CrewFieldPanel)$/}, args => ({path:args.path.split('/').pop(),namespace:'startup-stub'})); b.onLoad({filter:/.*/,namespace:'startup-stub'},args=>({contents:`import {createElement} from 'react'; export default function View(){return createElement('div',{'data-test-view':'${args.path}'});}`,loader:'js',resolveDir:process.cwd()})); }}] : []});
    const result = spawnSync(process.execPath, [outfile], {stdio:'inherit'});
    if(result.status !== 0) process.exitCode = 1;
  }
} finally { rmSync(dir, {recursive:true, force:true}); }

const databaseTests = spawnSync(process.execPath, ['--experimental-sqlite','scripts/test_sqlite.mjs'], {stdio:'inherit'});
if(databaseTests.status !== 0) process.exitCode = 1;

const apiTests = spawnSync(process.execPath, ['scripts/test_api.mjs'], {stdio:'inherit'});
if(apiTests.status !== 0) process.exitCode = 1;
const sessionTests=spawnSync(process.execPath,['--experimental-sqlite','scripts/test_session.mjs'],{stdio:'inherit'});
if(sessionTests.status!==0)process.exitCode=1;

const pgTests=spawnSync(process.execPath,["scripts/test_postgres.mjs"],{stdio:"inherit"});
if(pgTests.status!==0)process.exitCode=1;
