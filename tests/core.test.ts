import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database} from '../src/main/database';
import {loadMigrations} from '../src/main/migrations';
import {bootstrap} from '../src/main/bootstrap';
import {AuthService} from '../src/main/services/auth-service';
import {BusinessService} from '../src/main/services/business-service';
import {EntityRepository} from '../src/main/repositories/entity-repository';
import {IntegrationService} from '../src/main/services/integration-service';
import {PricingService} from '../src/main/services/pricing-service';
import {seedDemo} from '../src/main/seed';
import {definition,entityNames,type Entity,type Row,type Input} from '../src/shared/models';
import {today} from '../src/shared/validation';

const commercial=entityNames.some(n=>String(n)==='price_bands');
const input=(entity:Entity,row:Row):Input=>Object.fromEntries(definition(entity).fields.filter(f=>f.key!=='password').map(f=>[f.key,row[f.key]]));
test('usa faixa legada por adultos e tarifa infantil fixa quando não há faixas atuais',async t=>{
 const db=new Database('mysql'),pricing=new PricingService(db);
 let current:Row[]=[];
 t.mock.method(db,'query',async(sql:string)=>{
  if(sql.includes('FROM price_bands WHERE')) return current;
  if(sql.includes('information_schema.TABLES')) return [{id:1}];
  assert.match(sql,/FROM price_bands_legacy_004/);
  return [
   {id:1,min_adults:10,max_adults:19,price:'100.00',child_price:'30.00'},
   {id:2,min_adults:20,max_adults:40,price:'80.00',child_price:'25.00'}
  ];
 });
 const children=[
  {band_id:1,label:'Até 5 anos',min_age:0,max_age:5,percent:0,quantity:2},
  {band_id:2,label:'6 a 10 anos',min_age:6,max_age:10,percent:50,quantity:3}
 ];
 const legacy=await pricing.price(1,18,children,23);
 assert.equal(legacy?.bandId,null);
 assert.equal(legacy?.legacyBandId,1);
 assert.equal(legacy?.packageAmount,195000);
 assert.deepEqual(legacy?.childLines.map(row=>row.unitPrice),[3000,3000]);
 assert.equal((await pricing.price(1,18,[],23))?.childAmount,15000);
 await assert.rejects(()=>pricing.price(1,4,[],4),/Nenhuma faixa antiga/);
 current=[{id:1,min_guests:20,max_guests:30,price_per_adult:'100.00',min_billing_guests:0}];
 const modern=await pricing.price(1,18,children,23);
 assert.equal(modern?.bandId,1);
 assert.equal(modern?.legacyBandId,undefined);
 assert.equal(modern?.childAmount,15000);
});
async function fixture(t:{after:(f:()=>Promise<void>)=>void}){
 const db=new Database('demo');await db.connect();await db.migrateAll(loadMigrations('database'));await bootstrap(db);await seedDemo(db);
 const auth=new AuthService(db);await auth.login({login:'buffet',password:'atelie123'});const business=new BusinessService(new EntityRepository(db),auth),api=new IntegrationService(business,'demo');t.after(()=>db.close());return {db,auth,business,api};
}
test('conta inicial usa scrypt e não duplica usuários',async t=>{
 const {db,auth}=await fixture(t);await bootstrap(db);const users=await db.query('SELECT * FROM users');assert.equal(users.length,1);assert.equal(users[0].login,'buffet');assert.match(String(users[0].password_hash),/^scrypt\$/);assert.notEqual(users[0].password_hash,'atelie123');auth.logout();await assert.rejects(()=>auth.login({login:'buffet',password:'incorreta'}));await auth.login({login:'buffet',password:'atelie123'});
});
test('CRUD de cliente e rollback de transação',async t=>{
 const {db,business:b}=await fixture(t);const c=await b.save('clients',{name:'Teste CRUD',email:'teste@example.com',phone:'0',notes:''});assert.equal((await b.save('clients',{...input('clients',c),name:'Editado'},c.id)).name,'Editado');await b.remove('clients',c.id);assert.ok(!(await b.list('clients')).some(r=>r.id===c.id));
 await assert.rejects(()=>db.transaction(async()=>{await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Rollback','x@example.com','0','']);throw new Error('reverter');}));assert.equal((await db.query("SELECT id FROM clients WHERE name='Rollback'")).length,0);
});
test('SQLite persistente bloqueia exclusão de cliente vinculado a evento',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'buffet-db-test-'));
 const db=new Database('demo',join(dir,'buffet.sqlite'));
 await db.connect();
 t.after(async()=>{try{await db.close();}finally{await rm(dir,{recursive:true,force:true});}});
 await db.migrateAll(loadMigrations('database'));
 await bootstrap(db);
 await seedDemo(db);
 const auth=new AuthService(db);
 await auth.login({login:'buffet',password:'atelie123'});
 const business=new BusinessService(new EntityRepository(db),auth);
 const [event]=await business.list('events');
 await assert.rejects(()=>business.remove('clients',Number(event.client_id)),/FOREIGN KEY/i);
 assert.equal((await business.repo.find('clients',Number(event.client_id))).id,event.client_id);
});
test('mover crianças por faixa atualiza os totais dos dois eventos',async t=>{
 const {business}=await fixture(t);
 const [sample]=await business.list('events');
 const [band]=await business.list('child_bands');
 const base={...input('events',sample),status:'rascunho',menu_id:'',adults:10};
 const source=await business.save('events',{...base,name:'Origem'});
 const target=await business.save('events',{...base,name:'Destino'});
 const group=await business.save('event_guests',{event_id:source.id,child_band_id:band.id,quantity:3});
 await business.save('event_guests',{event_id:target.id,child_band_id:band.id,quantity:3},group.id);
 assert.equal((await business.repo.find('events',source.id)).guests,10);
 assert.equal((await business.repo.find('events',target.id)).guests,13);
});
test('perfil de operações não cria evento nem lê cadastros restritos',async t=>{
 const {auth,business}=await fixture(t);
 const [event]=await business.list('events');
 await business.save('users',{name:'Equipe de teste',login:'operacao-teste',password:'Senha-teste-2026',role:'operacoes',status:'ativo'});
 auth.logout();
 await auth.login({login:'operacao-teste',password:'Senha-teste-2026'});
 assert.ok((await business.list('events')).length);
 await assert.rejects(()=>business.list('clients'),/exige perfil/);
 await assert.rejects(()=>business.list('quotes'),/exige perfil/);
 await assert.rejects(()=>business.list('child_bands'),/administradores/);
 await assert.rejects(()=>business.save('events',{...input('events',event),status:'rascunho'}),/novos eventos exige/);
});
test('salva evento sem cardápio, lista faixas e orça itens avulsos',async t=>{
 const {business:b}=await fixture(t);
 const sample=(await b.list('events'))[0],item=(await b.list('menu_items'))[0];
 const event=await b.save('events',{...input('events',sample),status:'rascunho',menu_id:''});
 assert.equal(event.menu_id,null);
 assert.ok((await b.list('child_bands')).length);
 await b.save('event_items',{event_id:event.id,item_id:item.id,quantity:1,unit_price:'10.00'});
 const quote=await b.save('quotes',{event_id:event.id,valid_until:today(),distance_km:0,rate_km:'0.00',trips:'2',distance_source:'manual',extra:'0.00',discount:'0.00',status:'rascunho',notes:''});
 assert.equal(Number(quote.subtotal),10);
 assert.equal(Number(quote.total),10.60);
});
test('repara banco SQLite já marcado com a migração 002 sem a coluna cost',async t=>{
 const db=new Database('demo');await db.connect();t.after(()=>db.close());
 const [initial,commercial,repair]=loadMigrations('database');
 await db.migrate(initial.sql,initial.version);
 await db.migrate(commercial.sql.replace(/^ALTER TABLE menu_items ADD COLUMN cost[^;]+;/m,''),commercial.version);
 await db.execute("INSERT INTO menu_items(name,description,unit,price,restrictions) VALUES('Item existente','','unidade',10,'')");
 await db.migrate(repair.sql,repair.version);
 assert.deepEqual(await db.query('SELECT name,cost FROM menu_items'),[{name:'Item existente',cost:0}]);
});
test('completa esquema comercial parcial mesmo com as versões anteriores registradas',async t=>{
 const db=new Database('demo');await db.connect();t.after(()=>db.close());
 const migrations=loadMigrations('database');
 await db.migrate(migrations[0].sql,1);
 await db.migrate('ALTER TABLE events ADD COLUMN adults INT NOT NULL DEFAULT 0;',2);
 await db.migrate('',3);
 await db.execute("INSERT INTO menu_items(name,description,unit,price,restrictions) VALUES('Item preservado','','unidade',10,'')");
 await db.migrateAll(migrations);
 assert.deepEqual(await db.query('SELECT name,cost FROM menu_items'),[{name:'Item preservado',cost:0}]);
 assert.deepEqual(await db.query('SELECT percent FROM child_bands'),[]);
 assert.deepEqual(await db.query('SELECT child_band_id FROM event_guests'),[]);
 assert.deepEqual(await db.query('SELECT adult_unit_price,deposit_required FROM quotes'),[]);
 assert.deepEqual(await db.query('SELECT version FROM schema_migrations ORDER BY version'),[1,2,3,4].map(version=>({version})));
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
   assert.equal(body.from,process.env.RESEND_FROM_EMAIL);
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
 process.env.RESEND_FROM_EMAIL='Ateliê <onboarding@resend.dev>';
 await assert.rejects(()=>live.sendEmail(preview.token),/@resend\.dev é de teste.*RESEND_FROM_EMAIL/);
 assert.equal((await live.history())[0].status,'falhou');
 process.env.RESEND_FROM_EMAIL='Ateliê <buffet@example.com>';
 const verifiedSenderPreview=await live.previewEmail(inputEmail);
 await assert.rejects(()=>live.sendEmail(verifiedSenderPreview.token),/domínio do remetente está verificado/);
 assert.equal((await live.history())[0].status,'falhou');
 assert.equal((await business.repo.find('quotes',quote.id)).status,'rascunho');
 status=200;
 const retry=await live.previewEmail(inputEmail);
 const result=await live.sendEmail(retry.token);
 assert.equal(result.providerId,'resend-id');
 assert.equal(result.status,'aceito_provedor');
 assert.equal((await live.history())[0].provider_id,'resend-id');
 assert.equal(keys[1],keys[2]);
 await assert.rejects(()=>live.sendEmail(retry.token),/já utilizada/);
 const restarted=new IntegrationService(business,'live');
 const duplicateAfterRestart=await restarted.previewEmail(inputEmail);
 await assert.rejects(()=>restarted.sendEmail(duplicateAfterRestart.token),/já foi aceita/);
 const confirmation={quoteId:quote.id,kind:'confirmacao'};
 await assert.rejects(()=>live.previewEmail(confirmation),/aprovado e evento confirmado/);
 const sent=await business.repo.find('quotes',quote.id);
 await business.save('quotes',{...input('quotes',sent),status:'aprovado'},quote.id);
  const approved=await business.repo.find('quotes',quote.id);
  await business.save('installments' as Entity,{event_id:event.id,due_date:today(),amount:approved.deposit_required,paid_amount:approved.deposit_required,paid_at:today(),kind:'sinal',notes:'Sinal do teste.'});
 const updatedEvent=await business.repo.find('events',event.id);
 await business.save('events',{...input('events',updatedEvent),status:'confirmado'},event.id);
 const confirmPreview=await live.previewEmail(confirmation);
 assert.match(confirmPreview.subject,/Confirmação/);
 status=503;
 await assert.rejects(()=>live.sendEmail(confirmPreview.token),/resultado do envio é incerto/);
 assert.equal((await live.history())[0].status,'resultado_incerto');
 assert.notEqual(keys[2],keys[3]);
 const uncertainRetry=await restarted.previewEmail(confirmation);
 await assert.rejects(()=>restarted.sendEmail(uncertainRetry.token),/pendente ou incerto/);
 assert.equal(fetchMock.mock.callCount(),4);
 assert.equal((await db.query('SELECT provider_id FROM email_attempts WHERE status=?',['aceito_provedor'])).length,1);
});

test('faixa de preço usa o total de convidados e diferencia crianças',async t=>{
 const {business:b,db}=await fixture(t);
 const events=await b.list('events');
 const event=events.find(row=>String(row.name)==='Um novo ciclo · Marina')!;
 assert.equal(Number(event.adults),55);
 const first=await b.save('quotes',quoteFields(Number(event.id)));
 assert.equal(Number(first.adults),55);
 assert.equal(Number(first.children),5);
 assert.equal(Number(first.adult_unit_price),95);
 assert.equal(Math.round(Number(first.child_amount)*100),23750);
 const band=await db.query('SELECT min_guests,max_guests FROM price_bands WHERE id=?',[first.price_band_id]);
 assert.deepEqual([Number(band[0].min_guests),Number(band[0].max_guests)],[1,60]);
 const revenue=Number(first.subtotal)+Number(first.freight)+Number(first.extra)-Number(first.discount);
 assert.equal(Math.round(Number(first.total)*100),Math.round((revenue+Number(first.tax_amount))*100));
 assert.equal(Math.round(Number(first.margin_amount)*100),Math.round((revenue-Number(first.cost_amount)-Number(first.tax_amount))*100));

 const count=await db.query('SELECT * FROM event_guests WHERE event_id=?',[event.id]);
 await b.save('event_guests',{event_id:event.id,child_band_id:Number(count[0].child_band_id),quantity:6},Number(count[0].id));
 assert.equal(Number((await b.repo.find('events',Number(event.id))).guests),61);
 const second=await b.save('quotes',quoteFields(Number(event.id)));
 assert.equal(Number(second.adult_unit_price),88);
 assert.deepEqual([Number(second.adults),Number(second.children)],[55,6]);

 const free=await db.query('SELECT id FROM child_bands WHERE percent=0');
 await b.save('event_guests',{event_id:event.id,child_band_id:Number(free[0].id),quantity:4});
 const third=await b.save('quotes',quoteFields(Number(event.id)));
 assert.deepEqual([Number(third.adults),Number(third.children)],[55,10]);
 assert.equal(Number(third.adult_unit_price),88);
 assert.equal(Math.round(Number(third.child_amount)*100),26400);
});

test('cardápio gera quantidades automáticas e permite ajuste',async t=>{
 const {business:b,db}=await fixture(t);
 const event=(await b.list('events')).find(row=>String(row.name)==='Um novo ciclo · Marina')!;
 const components=await db.query('SELECT item_id,quantity FROM menu_compositions WHERE menu_id=? ORDER BY item_id',[event.menu_id]);
 const applied=await b.applyMenu(Number(event.id));
 assert.equal(applied.length,components.length);
 const row=applied.find(item=>Number(item.item_id)===Number(components[0].item_id))!;
 assert.equal(Number(row.quantity),Math.round(Number(components[0].quantity)*Number(event.guests)*1000)/1000);
 const adjusted=Number(row.quantity)+2;
 await b.save('event_menu_items',{event_id:event.id,item_id:Number(row.item_id),quantity:adjusted},Number(row.id));
 assert.equal(Number((await b.repo.find('event_menu_items',Number(row.id))).quantity),adjusted);
 const quote=await b.save('quotes',quoteFields(Number(event.id)));
 assert.ok(Number(quote.cost_amount)>0);
});

test('cancelamento calcula multa e reembolso e aceita ajuste manual',async t=>{
 // Fixe o relógio ao meio-dia em São Paulo: o seed usa UTC e a política usa a data local.
 t.mock.timers.enable({apis:['Date'],now:new Date(`${today()}T15:00:00Z`)});
 const {business:b,db}=await fixture(t);
 const events=await b.list('events');
 const soon=events.find(row=>String(row.name)==='Um novo ciclo · Marina')!;
 const later=events.find(row=>String(row.name)==='O sim de Rafael & Luiza')!;
 await b.save('installments' as Entity,{event_id:soon.id,due_date:today(),amount:'100.00',paid_amount:'100.00',paid_at:today(),kind:'sinal',notes:''});
 const preview=await b.previewCancellation(Number(soon.id));
 assert.deepEqual([preview.days,preview.percent,preview.penalty,preview.refund],[4,100,'100.00','0.00']);
 const cancelled=await b.cancelEvent({eventId:soon.id,reason:'Imprevisto do cliente'});
 assert.equal(Number(cancelled.penalty_amount),100);
 assert.equal((await b.repo.find('events',Number(soon.id))).status,'cancelado');
 assert.equal((await b.cancellations()).length,1);

 await b.save('installments' as Entity,{event_id:later.id,due_date:today(),amount:'200.00',paid_amount:'200.00',paid_at:today(),kind:'sinal',notes:''});
 const policy=await b.previewCancellation(Number(later.id));
 assert.deepEqual([policy.percent,policy.refund],[30,'140.00']);
 const manual=await b.cancelEvent({eventId:later.id,reason:'Acordo comercial',penalty:'10.00'});
 assert.deepEqual([Number(manual.penalty_amount),Number(manual.refund_amount)],[10,190]);
 assert.equal(Number((await db.query('SELECT COUNT(*) AS total FROM cancellations'))[0].total),2);
});

test('confirmação exige sinal pago e parcelas somam o total',async t=>{
 const {business:b,db}=await fixture(t);
 const event=(await b.list('events')).find(row=>String(row.name)==='Um novo ciclo · Marina')!;
 const draft=await b.save('quotes',quoteFields(Number(event.id)));
 await b.save('quotes',{...input('quotes',draft),status:'enviado'},Number(draft.id));
 const approved=await b.save('quotes',{...input('quotes',draft),status:'aprovado'},Number(draft.id));
 await assert.rejects(()=>b.save('events',{...input('events',event),status:'confirmado'},Number(event.id)),/sinal/);
 await b.save('installments' as Entity,{event_id:event.id,due_date:today(),amount:approved.deposit_required,paid_amount:approved.deposit_required,paid_at:today(),kind:'sinal',notes:''});
 assert.equal((await b.save('events',{...input('events',event),status:'confirmado'},Number(event.id))).status,'confirmado');
 const plan=await b.financePlan({eventId:Number(event.id),count:3});
 const sum=plan.reduce((total,row)=>total+Math.round(Number(row.amount)*100),0);
 assert.equal(sum,Math.round(Number(approved.total)*100));
 assert.ok(plan.some(row=>row.kind==='sinal'));
 assert.equal(Number((await db.query('SELECT COUNT(*) AS total FROM installments WHERE event_id=?',[event.id]))[0].total),4);
});

test('conflito de escala só bloqueia evento confirmado',async t=>{
 const {business:b,db}=await fixture(t);
 const events=await b.list('events');
 const first=events.find(row=>String(row.name)==='Um novo ciclo · Marina')!;
 const second=events.find(row=>String(row.name)==='Encontro Horizonte')!;
 await db.execute('UPDATE events SET setup_at=?,starts_at=?,ends_at=?,teardown_at=? WHERE id=?',[first.setup_at,first.starts_at,first.ends_at,first.teardown_at,second.id]);
 const employee=(await b.list('employees'))[0];
 const shift={event_id:first.id,employee_id:employee.id,job:'Apoio',starts_at:first.setup_at,ends_at:first.teardown_at,cost:'100.00'};
 await b.save('event_staff',shift);
 await db.execute("UPDATE events SET status='confirmado' WHERE id=?",[second.id]);
 await assert.rejects(()=>b.save('event_staff',{...shift,event_id:second.id}),/Conflito/);
});

test('arquivamento preserva o registro e o remove do painel',async t=>{
 const {business:b}=await fixture(t);
 const event=(await b.list('events'))[0];
 const before=(await b.dashboard()).activeEvents;
 await b.archive('events',Number(event.id),true);
 assert.equal(Number((await b.repo.find('events',Number(event.id))).archived),1);
 assert.equal((await b.dashboard()).activeEvents,before-1);
 await b.archive('events',Number(event.id),false);
 assert.equal((await b.dashboard()).activeEvents,before);
});
