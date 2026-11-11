import 'dotenv/config';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Database} from '../src/main/database';
import {PasswordService} from '../src/main/services/auth-service';
import {assert,BusinessError} from '../src/shared/validation';

async function main():Promise<void>{
  const login=process.argv[2]?.toLowerCase();
  assert(login&&/^[a-z0-9_.@-]{3,80}$/.test(login),'Informe o novo login (3 a 80 caracteres).');
  const password=process.argv.includes('--password-stdin')?readFileSync(0,'utf8').trimEnd():'Wc!'+randomBytes(18).toString('base64url');
  const passwords=new PasswordService();const hash=await passwords.hash(password);
  assert(await passwords.verify(password,hash),'Falha ao validar a senha gerada.');
  const db=new Database('mysql');
  try{
    await db.connect();
    await db.transaction(async()=>{
      const admins=await db.query("SELECT id FROM users WHERE role='administrador' AND status='ativo' ORDER BY id");
      assert(admins.length,'Nenhum administrador ativo encontrado.');
      const id=admins[0].id;
      const collision=await db.query('SELECT id FROM users WHERE login=? AND id<>?',[login,id]);
      assert(!collision.length,'Esse login pertence a outra conta. Nenhuma alteração foi feita.');
      await db.execute('UPDATE users SET name=?,login=?,password_hash=? WHERE id=?',[login,login,hash,id]);
      const saved=(await db.query('SELECT password_hash FROM users WHERE id=?',[id]))[0];
      assert(await passwords.verify(password,String(saved.password_hash)),'A verificação da alteração falhou.');
    });
    console.log('Administrador principal do aplicativo atualizado.');
    console.log(`Login: ${login}\nSenha: ${password}`);
    console.log('Guarde a senha. Ela não foi gravada em arquivos nem no código-fonte. Feche e reabra o aplicativo.');
  }finally{await db.close();}
}
main().catch(error=>{console.error(error instanceof BusinessError?error.message:'Falha na alteração. Confira a conexão e as permissões do banco.');process.exitCode=1;});
