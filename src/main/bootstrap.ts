import {Database} from './database';
export async function bootstrap(db:Database):Promise<void>{
 await db.transaction(async()=>{if((await db.query('SELECT id FROM users LIMIT 1')).length)return;await db.execute("INSERT INTO users(name,login,password_hash,role,status) VALUES(?,?,?,'administrador','ativo')",['Buffet','buffet',"scrypt$32768$8$3$89936aa3328fc347cffb4692b4268c68$d6125215541eea206fe77d2367a93d15d87475a69af5d1e1c46a092adc6df819db2111ec4bd86b82c6537c4300e3d494eb43fbc2bc13fa4efd9b81522d306b13"]);});
}
