import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import type {Role,Row,User} from '../../shared/models';
import {asObject,assert,BusinessError} from '../../shared/validation';
import {Database} from '../database';

export class PasswordService {
  async hash(password:unknown):Promise<string> {
    assert(typeof password==='string'&&password.length>=8&&password.length<=128,'A senha deve ter de 8 a 128 caracteres.');
    const salt=randomBytes(16).toString('hex');
    const hash=await new Promise<Buffer>((resolve,reject)=>scryptCallback(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
    return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
  }
  async verify(password:string,encoded:string):Promise<boolean> {
    const [algorithm,n,r,p,salt,hash]=encoded.split('$');
    if(algorithm!=='scrypt'||!salt||!hash) return false;
    const derived=await new Promise<Buffer>((resolve,reject)=>scryptCallback(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
    const expected=Buffer.from(hash,'hex');return expected.length===derived.length&&timingSafeEqual(expected,derived);
  }
}
export class AuthService {
  private current:User|null=null; private expiresAt=0;
  private attempts=new Map<string,{count:number;until:number}>();
  readonly passwords=new PasswordService();
  constructor(private db:Database) {}
  async needsSetup():Promise<boolean> {return (await this.db.query('SELECT id FROM users LIMIT 1')).length===0;}
  private identify(row:Row):User {return {id:row.id,name:String(row.name),login:String(row.login),role:row.role as Role};}
  async setup(raw:unknown):Promise<User> {
    const input=asObject(raw);
    assert(await this.needsSetup(),'O administrador inicial já foi cadastrado.');
    assert(typeof input.name==='string'&&input.name.trim().length>=2&&input.name.length<=200,'Informe seu nome.');
    const login=this.loginValue(input.login);const hash=await this.passwords.hash(input.password);
    await this.db.transaction(async()=>{assert(await this.needsSetup(),'O administrador já foi cadastrado.');await this.db.execute("INSERT INTO users(name,login,password_hash,role,status) VALUES(?,?,?,'administrador','ativo')",[String(input.name).trim(),login,hash]);});
    return this.login({login,password:input.password});
  }
  private loginValue(value:unknown):string {assert(typeof value==='string'&&/^[a-zA-Z0-9_.@-]{3,80}$/.test(value),'Login: use 3 a 80 letras, números, ponto, @, hífen ou sublinhado.');return value.toLowerCase();}
  async login(raw:unknown):Promise<User> {
    const input=asObject(raw);const login=this.loginValue(input.login);
    assert(typeof input.password==='string'&&input.password.length<=128,'Credenciais inválidas.');
    const now=Date.now();let attempt=this.attempts.get(login);
    if(attempt&&attempt.until<now) {this.attempts.delete(login);attempt=undefined;}
    assert(!attempt||attempt.count<5,'Muitas tentativas. Aguarde 5 minutos.');
    const rows=await this.db.query('SELECT * FROM users WHERE login = ?',[login]);
    // O hash fictício mantém trabalho de derivação mesmo para login desconhecido.
    const encoded=rows[0]?.password_hash||'scrypt$32768$8$3$00000000000000000000000000000000$'+'00'.repeat(64);
    const valid=await this.passwords.verify(input.password,String(encoded));
    if(!valid||!rows.length||rows[0].status!=='ativo') {
      if(this.attempts.size>=500&&!this.attempts.has(login)) this.attempts.delete(this.attempts.keys().next().value!);
      this.attempts.set(login,{count:(attempt?.count||0)+1,until:attempt?.until||now+300000});
      throw new BusinessError('Login ou senha inválidos.');
    }
    this.attempts.delete(login);this.current=this.identify(rows[0]);this.expiresAt=now+8*3600000;return this.current;
  }
  async user(required=true):Promise<User|null> {
    if(this.current&&Date.now()<this.expiresAt) {
      const row=(await this.db.query('SELECT id,name,login,role,status FROM users WHERE id = ?',[this.current.id]))[0];
      if(row?.status==='ativo') {this.current=this.identify(row);return this.current;}
    }
    this.current=null;
    assert(!required,'Sua sessão terminou. Entre novamente.');return null;
  }
  logout():void {this.current=null;this.expiresAt=0;}
}

