import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export interface Migration {version:number; sql:string;}

export function loadMigrations(directory:string):Migration[] {
  return readdirSync(directory)
    .filter(file=>/^\d+_.+\.sql$/.test(file))
    .sort()
    .map(file=>({version:Number(file.slice(0,3)),sql:readFileSync(join(directory,file),'utf8')}));
}
