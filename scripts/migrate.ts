import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {Database} from '../src/main/database';
async function main():Promise<void> {
  const db=new Database('mysql');try {await db.connect();await db.migrate(readFileSync('database/001_initial.sql','utf8'));console.log('Banco preparado. Configure o primeiro administrador ao abrir o aplicativo.');} finally {await db.close();}
}
main().catch(()=>{console.error('Falha na migração. Confira .env, conexão e privilégios do usuário de migração.');process.exitCode=1;});
