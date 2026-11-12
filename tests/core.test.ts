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
test('ViaCEP valida formato, sucesso, CEP inexistente e falha de conexão',async t=>{
 const {business,api}=await fixture(t);
 assert.equal((await api.cep('01001000')).demo,true);
 const live=new IntegrationService(business,'live');
 const fetchMock=t.mock.method(globalThis,'fetch',async(url:string)=>{
   if(url.includes('99999999')) return Response.json({erro:'true'});
   if(url.includes('13484332')) throw new TypeError('connection reset');
   assert.equal(url,'https://viacep.com.br/ws/01001000/json/');
   return Response.json({logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP'});
 });
 await assert.rejects(()=>live.cep('01001A00'),/oito dígitos/);
 assert.equal(fetchMock.mock.callCount(),0);
 const result=await live.cep('01001-000');
 assert.equal(result.demo,false);
 assert.equal(result.source,'ViaCEP');
 assert.equal(result.street,'Praça da Sé');
 assert.equal(result.district,'Sé');
 assert.equal(result.city,'São Paulo');
 assert.equal(result.state,'SP');
 assert.equal((await live.cep('01001000')).cached,true);
 await assert.rejects(()=>live.cep('99999999'),/CEP não encontrado/);
 await assert.rejects(()=>live.cep('13484332'),/falha de conexão/);
 assert.equal(fetchMock.mock.callCount(),3);
});

test('Open-Meteo usa a data local, alerta acima de 50% e rejeita dados incompletos',async t=>{
 const {business,db}=await fixture(t);
 const event=(await business.list('events'))[0];
 const date=today();
 const moveEvent=(day:string)=>db.execute("UPDATE events SET setup_at=?,starts_at=?,ends_at=?,teardown_at=?,outdoors='aberto' WHERE id=?",
   [day+' 22:30:00',day+' 23:30:00',day+' 23:40:00',day+' 23:50:00',event.id]);
 await moveEvent(date);
 let probability:number|null=51;
 const fetchMock=t.mock.method(globalThis,'fetch',async(raw:string)=>{
   const url=new URL(raw);
   assert.equal(url.origin+url.pathname,'https://api.open-meteo.com/v1/forecast');
   assert.equal(url.searchParams.get('start_date'),date);
   assert.equal(url.searchParams.get('end_date'),date);
   assert.equal(url.searchParams.get('timezone'),'America/Sao_Paulo');
   return Response.json({daily:{time:[date],temperature_2m_min:[18],temperature_2m_max:[29],
     precipitation_probability_max:[probability],precipitation_sum:[3.5]}});
 });
 const live=new IntegrationService(business,'live');
 const forecast=await live.weather(event.id);
 assert.deepEqual([forecast.demo,forecast.available,forecast.date,forecast.min,forecast.max,forecast.rainProbability,
   forecast.precipitation,forecast.rainAlert],[false,true,date,18,29,51,3.5,true]);
 await db.execute("UPDATE events SET outdoors='fechado' WHERE id=?",[event.id]);
 assert.equal((await live.weather(event.id)).rainAlert,false);
 await db.execute("UPDATE events SET outdoors='aberto' WHERE id=?",[event.id]);
 probability=50;
 assert.equal((await new IntegrationService(business,'live').weather(event.id)).rainAlert,false);
 probability=null;
 await assert.rejects(()=>new IntegrationService(business,'live').weather(event.id),/previsão incompleta/);
 const future=new Date(Date.parse(date)+16*86400000).toISOString().slice(0,10);
 await moveEvent(future);
 const unavailable=await live.weather(event.id);
 assert.equal(unavailable.available,false);
 assert.match(String(unavailable.message),/ainda não está disponível/);
 assert.equal(fetchMock.mock.callCount(),3);
});

test('openrouteservice geocodifica e calcula o trajeto rodoviário com conversão de unidades',async t=>{
 const {business,db}=await fixture(t);
 const event=(await business.list('events'))[0];
 const oldKey=process.env.OPENROUTESERVICE_API_KEY,oldCep=process.env.BUFFET_ORIGIN_CEP;
 process.env.OPENROUTESERVICE_API_KEY='test-key';
 process.env.BUFFET_ORIGIN_CEP='13484-332';
 t.after(()=>{
   if(oldKey===undefined) delete process.env.OPENROUTESERVICE_API_KEY;else process.env.OPENROUTESERVICE_API_KEY=oldKey;
   if(oldCep===undefined) delete process.env.BUFFET_ORIGIN_CEP;else process.env.BUFFET_ORIGIN_CEP=oldCep;
 });
 const origin=[-47.4,-22.6],destination=[Number(event.longitude),Number(event.latitude)];
 let response:unknown={routes:[{summary:{distance:18345,duration:1890}}]};
 const fetchMock=t.mock.method(globalThis,'fetch',async(raw:string,init:RequestInit)=>{
   const url=new URL(raw);
   if(url.hostname==='viacep.com.br') {
     assert.equal(url.pathname,'/ws/13484332/json/');
     return Response.json({logradouro:'Rua Paschoal Marmo',bairro:'Centro',localidade:'Limeira',uf:'SP'});
   }
   assert.equal(url.hostname,'api.openrouteservice.org');
   if(url.pathname==='/geocode/search') {
     assert.equal(url.searchParams.get('api_key'),'test-key');
     assert.equal(url.searchParams.get('boundary.country'),'BR');
     if(url.searchParams.get('text')==='Endereço inexistente') return Response.json({features:[]});
     return Response.json({features:[{geometry:{type:'Point',coordinates:origin},
       properties:{label:'Rua Paschoal Marmo 1888, Limeira',street:'Rua Paschoal Marmo',housenumber:'1888'}}]});
   }
   assert.equal(url.pathname,'/v2/directions/driving-car/json');
   assert.equal(init.method,'POST');
   assert.equal(new Headers(init.headers).get('Authorization'),'test-key');
   assert.deepEqual(JSON.parse(String(init.body)),{coordinates:[origin,destination]});
   return Response.json(response);
 });
 const live=new IntegrationService(business,'live');
 const geo=await live.geocode('Rua Paschoal Marmo, 1888, Limeira');
 assert.equal(geo.demo,false);
 assert.deepEqual(geo.candidates,[{label:'Rua Paschoal Marmo 1888, Limeira',coordinates:origin}]);
 await assert.rejects(()=>live.geocode('Endereço inexistente'),/Nenhum local encontrado/);
 const result=await live.route({eventId:event.id});
 assert.deepEqual([result.demo,result.km,result.minutes],[false,18.345,31.5]);
 const direct={origin,destination};
 response={routes:[]};
 await assert.rejects(()=>new IntegrationService(business,'live').route(direct),/Nenhuma rota rodoviária/);
 response={routes:[{summary:{distance:'18345',duration:1890}}]};
 await assert.rejects(()=>new IntegrationService(business,'live').route(direct),/resposta inválida/);
 const calls=fetchMock.mock.callCount();
 await assert.rejects(()=>live.route({origin:[181,0],destination}),/coordenadas válidas/);
 await db.execute("UPDATE events SET city='Limeira',state='SP',latitude=NULL,longitude=NULL WHERE id=?",[event.id]);
 assert.equal((await live.route({eventId:event.id})).exempt,true);
 assert.equal(fetchMock.mock.callCount(),calls);
 const quote=await business.save('quotes',quoteFields(event.id));
 assert.equal(Number(quote.freight),0);
});

function quoteFields(eventId:number):Input {
 return {event_id:eventId,valid_until:today(),freight_base:'0.00',distance_km:18.345,rate_km:'2.00',
   trips:'1',distance_source:'openrouteservice',extra:'0.00',discount:'0.00',status:'rascunho',notes:''};
}

test('Resend envia só após confirmação, preserva o histórico e impede duplicidade',async t=>{
 const {business,db}=await fixture(t);
 const event=(await business.list('events'))[0];
 const quote=await business.save('quotes',quoteFields(event.id));
 assert.equal(Number(quote.trips),2);
 assert.equal(Number(quote.freight),73.38);
 for(const [key,value] of Object.entries({RESEND_API_KEY:'test-key',RESEND_FROM_EMAIL:'Ateliê <buffet@example.com>'})) {
   const previous=process.env[key];
   process.env[key]=value;
   t.after(()=>{if(previous===undefined) delete process.env[key];else process.env[key]=previous;});
 }
 let status=403;
 const keys:string[]=[];
 const fetchMock=t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
   assert.equal(url,'https://api.resend.com/emails');
   assert.equal(init.method,'POST');
   const headers=new Headers(init.headers);
   assert.equal(headers.get('Authorization'),'Bearer test-key');
   const key=headers.get('Idempotency-Key')??'';
   assert.match(key,/^[a-f0-9]{64}$/);
   keys.push(key);
   const body=JSON.parse(String(init.body));
   assert.equal(body.from,'Ateliê <buffet@example.com>');
   assert.ok(Array.isArray(body.to)&&body.to.length===1);
   assert.match(body.text,/Total:/);
   if(status===503) throw new TypeError('connection lost');
   return Response.json(status===200?{id:'resend-id'}:{message:'internal detail'},{status});
 });
 const live=new IntegrationService(business,'live');
 const inputEmail={quoteId:quote.id,kind:'orcamento'};
 const preview=await live.previewEmail(inputEmail);
 assert.equal(preview.demo,false);
 assert.match(preview.subject,/Orçamento/);
 assert.match(preview.text,/Validade:/);
 await assert.rejects(()=>live.sendEmail('sem confirmação'),/prévia/);
 assert.equal(fetchMock.mock.callCount(),0);
 await assert.rejects(()=>live.sendEmail(preview.token),/domínio verificado/);
 assert.equal((await live.history())[0].status,'falhou');
 assert.equal((await business.repo.find('quotes',quote.id)).status,'rascunho');
 status=200;
 const retry=await live.previewEmail(inputEmail);
 const result=await live.sendEmail(retry.token);
 assert.equal(result.providerId,'resend-id');
 assert.equal(result.status,'aceito_provedor');
 assert.equal((await live.history())[0].provider_id,'resend-id');
 assert.equal(keys[0],keys[1]);
 await assert.rejects(()=>live.sendEmail(retry.token),/já utilizada/);
 const restarted=new IntegrationService(business,'live');
 const duplicateAfterRestart=await restarted.previewEmail(inputEmail);
 await assert.rejects(()=>restarted.sendEmail(duplicateAfterRestart.token),/já foi aceita/);
 const confirmation={quoteId:quote.id,kind:'confirmacao'};
 await assert.rejects(()=>live.previewEmail(confirmation),/aprovado e evento confirmado/);
 const sent=await business.repo.find('quotes',quote.id);
 await business.save('quotes',{...input('quotes',sent),status:'aprovado'},quote.id);
 const updatedEvent=await business.repo.find('events',event.id);
 await business.save('events',{...input('events',updatedEvent),status:'confirmado'},event.id);
 const confirmPreview=await live.previewEmail(confirmation);
 assert.match(confirmPreview.subject,/Confirmação/);
 status=503;
 await assert.rejects(()=>live.sendEmail(confirmPreview.token),/resultado do envio é incerto/);
 assert.equal((await live.history())[0].status,'resultado_incerto');
 assert.notEqual(keys[1],keys[2]);
 const uncertainRetry=await restarted.previewEmail(confirmation);
 await assert.rejects(()=>restarted.sendEmail(uncertainRetry.token),/pendente ou incerto/);
 assert.equal(fetchMock.mock.callCount(),3);
 assert.equal((await db.query('SELECT provider_id FROM email_attempts WHERE status=?',['aceito_provedor'])).length,1);
});
