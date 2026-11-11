import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Database} from '../src/main/database';
import {bootstrap} from '../src/main/bootstrap';
import {AuthService} from '../src/main/services/auth-service';
import {BusinessService} from '../src/main/services/business-service';
import {EntityRepository} from '../src/main/repositories/entity-repository';
import {IntegrationService} from '../src/main/services/integration-service';
import {seedDemo} from '../src/main/seed';
import {definition,entityNames,type Entity,type Row,type Input} from '../src/shared/models';
import {today} from '../src/shared/validation';

const commercial=entityNames.some(n=>String(n)==='price_bands');
const input=(entity:Entity,row:Row):Input=>Object.fromEntries(definition(entity).fields.filter(f=>f.key!=='password').map(f=>[f.key,row[f.key]]));
async function fixture(t:{after:(f:()=>Promise<void>)=>void}){
 const db=new Database('demo');await db.connect();await db.migrate(readFileSync('database/001_initial.sql','utf8'));await bootstrap(db);await seedDemo(db);
 const auth=new AuthService(db);await auth.login({login:'buffet',password:'atelie123'});const business=new BusinessService(new EntityRepository(db),auth),api=new IntegrationService(business,'demo');t.after(()=>db.close());return {db,auth,business,api};
}
test('conta inicial usa scrypt e não duplica usuários',async t=>{
 const {db,auth}=await fixture(t);await bootstrap(db);const users=await db.query('SELECT * FROM users');assert.equal(users.length,1);assert.equal(users[0].login,'buffet');assert.match(String(users[0].password_hash),/^scrypt\$/);assert.notEqual(users[0].password_hash,'atelie123');auth.logout();await assert.rejects(()=>auth.login({login:'buffet',password:'incorreta'}));await auth.login({login:'buffet',password:'atelie123'});
});
test('CRUD de cliente e rollback de transação',async t=>{
 const {db,business:b}=await fixture(t);const c=await b.save('clients',{name:'Teste CRUD',email:'teste@example.com',phone:'0',notes:''});assert.equal((await b.save('clients',{...input('clients',c),name:'Editado'},c.id)).name,'Editado');await b.remove('clients',c.id);assert.ok(!(await b.list('clients')).some(r=>r.id===c.id));
 await assert.rejects(()=>db.transaction(async()=>{await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Rollback','x@example.com','0','']);throw new Error('reverter');}));assert.equal((await db.query("SELECT id FROM clients WHERE name='Rollback'")).length,0);
});
test('orçamento, aprovação e confirmação respeitam as regras',async t=>{
 const {business:b,db}=await fixture(t),event=(await b.list('events'))[0];
 const raw={event_id:event.id,valid_until:today(),freight_base:'30.00',distance_km:18.4,rate_km:'2.50',trips:'2',distance_source:'manual',extra:'10.00',discount:'5.00',status:'rascunho',notes:''};
 const draft=await b.save('quotes',raw);assert.equal(Number(draft.freight),commercial?92:122);assert.ok(Number(draft.total)>0);
 const sent=await b.save('quotes',{...input('quotes',draft),status:'enviado'},draft.id);
 if(commercial){const changed=await b.save('quotes',{...input('quotes',sent),discount:'6.00'},sent.id);assert.equal(Number(changed.discount),6);assert.ok((await db.query('SELECT id FROM change_history')).length);}
 else await assert.rejects(()=>b.save('quotes',{...input('quotes',sent),discount:'6.00'},sent.id),/imutáveis/);
 const approved=await b.save('quotes',{...input('quotes',sent),status:'aprovado'},sent.id);
 if(commercial){await assert.rejects(()=>b.save('events',{...input('events',event),status:'confirmado'},event.id),/sinal/);await b.save('installments' as Entity,{event_id:event.id,due_date:today(),amount:approved.deposit_required,paid_amount:approved.deposit_required,paid_at:today(),kind:'sinal',notes:''});}
 assert.equal((await b.save('events',{...input('events',event),status:'confirmado'},event.id)).status,'confirmado');
});
test('integrações simuladas não enviam mensagens e consultas reais validam a resposta',async t=>{
 const {business:b,api}=await fixture(t);assert.equal((await api.cep('01001000')).demo,true);
 const live=new IntegrationService(b,'live');let requests=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(JSON.stringify({logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP'}),{status:200});});
 const result=await live.cep('01001000');assert.equal(result.demo,live.mode==='demo');assert.equal(requests,live.mode==='demo'?0:1);
});
