import { existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22 || (major===22 && minor<12)){console.error('Install Node.js 22.12 or newer, reopen Terminal and run npm start.');process.exit(1);}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(args){const result=spawnSync(npm,args,{stdio:'inherit',shell:process.platform==='win32'});if(result.error){console.error(result.error.message);process.exit(1);}return result.status??1;}
if(!existsSync('node_modules/vite/bin/vite.js')){const code=run(['ci']);if(code)process.exit(code);}
const build=run(['run','build']);if(build)process.exit(build);
console.log('Starting MARSWalk 1.5.0 with SQLite. No database configuration required.');
const server=spawn(process.execPath,['--experimental-sqlite','server/index.mjs'],{stdio:'inherit'});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.on('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
