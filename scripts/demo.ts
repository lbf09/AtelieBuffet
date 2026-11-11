import {spawn} from 'node:child_process';
import electron from 'electron';
const env:NodeJS.ProcessEnv={...process.env,DB_MODE:'demo',API_MODE:'demo'};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron as unknown as string,['.'],{stdio:'inherit',env,windowsHide:true});
child.on('exit',code=>{process.exitCode=code||0;});
