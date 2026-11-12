import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import type {ApiReply,EmailPreview,Row} from '../../shared/models';
import {assert,today,validId,BusinessError} from '../../shared/validation';
import {BusinessService} from './business-service';

import {ProviderHttp,ProviderHttpError} from './provider-http';

const cepSchema=z.string().trim().regex(/^\d{5}-?\d{3}$/).transform(value=>value.replace('-',''));
const addressSchema=z.object({
  logradouro:z.string(),bairro:z.string(),localidade:z.string().min(1),uf:z.string().regex(/^[A-Z]{2}$/)
});
const coordinates=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]);
const routeInput=z.union([
  z.object({origin:coordinates,destination:coordinates}).strict(),
  z.object({eventId:z.number().int().positive()}).strict()
]);
const addressInput=z.string().trim().min(8).max(300);
const emailAddress=z.email().max(254);
const emailInput=z.object({quoteId:z.number().int().positive(),kind:z.enum(['orcamento','confirmacao'])}).strict();
const emailResponse=z.object({id:z.string().trim().min(1).max(200)});
const snapshotSchema=z.object({
  client:z.object({name:z.string().min(1),email:emailAddress}),
  event:z.object({
    name:z.string().min(1),starts_at:z.string().min(16),venue:z.string().min(1),
    street:z.string(),number:z.union([z.string(),z.number()]),city:z.string(),state:z.string(),
    guests:z.number().int().positive()
  }),
  items:z.array(z.object({
    name:z.string(),quantity:z.union([z.string(),z.number()]),unit:z.string(),
    unit_price:z.union([z.string(),z.number()])
  }))
});
const eventDate=z.iso.date();
const temperatures=z.array(z.number().nullable());
const forecastSchema=z.object({daily:z.object({
  time:z.array(eventDate),
  temperature_2m_min:temperatures,
  temperature_2m_max:temperatures,
  precipitation_probability_max:z.array(z.number().min(0).max(100).nullable()),
  precipitation_sum:z.array(z.number().nonnegative().nullable())
})});
const geocodeSchema=z.object({features:z.array(z.object({
  geometry:z.object({type:z.literal('Point'),coordinates}),
  properties:z.object({label:z.string().min(1),street:z.string().optional(),housenumber:z.string().optional()})
}))});
const directionsSchema=z.object({routes:z.array(z.object({
  summary:z.object({distance:z.number().min(0).max(100000000),duration:z.number().nonnegative()})
}))});
const orsName='openrouteservice';
const orsSource='openrouteservice / OpenStreetMap';
const timezone='America/Sao_Paulo';
const meta=(source:string,demo:boolean):ApiReply=>({source,queriedAt:new Date().toISOString(),demo});
const fingerprint=(row:Row)=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
const normalized=(text:string)=>text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
interface Prepared {preview:EmailPreview;quoteId:number;userId:number;kind:'orcamento'|'confirmacao';fingerprint:string;expires:number;}

export class IntegrationService {
  private previews=new Map<string,Prepared>();
  private cache=new Map<string,{expires:number;data:ApiReply}>();
  private http=new ProviderHttp();
  constructor(readonly business:BusinessService,readonly mode:'demo'|'live') {}

  private async cached(key:string,load:()=>Promise<ApiReply>):Promise<ApiReply> {
    const saved=this.cache.get(key);
    if(saved&&saved.expires>Date.now()) return {...saved.data,cached:true};
    const data=await load();
    if(this.cache.size>=200) this.cache.clear();
    this.cache.set(key,{expires:Date.now()+15*60000,data});
    return data;
  }

  private parse<T>(schema:z.ZodType<T>,raw:unknown,message:string):T {
    const result=schema.safeParse(raw);
    assert(result.success,message);
    return result.data;
  }

  private async lookupCep(cep:string) {
    const result=await this.http.json('ViaCEP',`https://viacep.com.br/ws/${cep}/json/`,
      z.union([z.object({erro:z.union([z.literal(true),z.literal('true')])}),addressSchema]),
      {},{400:'CEP inválido.'});
    assert(!('erro' in result),'CEP não encontrado. Complete o endereço manualmente.');
    return result;
  }

  async cep(raw:unknown):Promise<ApiReply> {
    await this.business.auth.user();
    const cep=this.parse(cepSchema,raw,'Informe um CEP válido com oito dígitos.');
    if(this.mode==='demo') return {...meta('ViaCEP — simulação',true),cep,street:'Praça de demonstração',district:'Centro',city:'Campinas',state:'SP'};
    return this.cached('cep:'+cep,async()=>{
      const result=await this.lookupCep(cep);
      return {...meta('ViaCEP',false),cep,street:result.logradouro,district:result.bairro,city:result.localidade,state:result.uf};
    });
  }

  private eventCoordinates(event:Row) {
    const values=[event.longitude,event.latitude].map(value=>
      typeof value==='string'&&value.trim() ? Number(value) : value);
    return this.parse(coordinates,values,'Informe latitude e longitude válidas no cadastro do evento.');
  }

  async weather(raw:unknown):Promise<ApiReply> {
    await this.business.authorize('events');
    const event=await this.business.repo.find('events',validId(raw));
    const date=this.parse(eventDate,String(event.starts_at).slice(0,10),'Data do evento inválida.');
    const days=(Date.parse(date)-Date.parse(today()))/86400000;
    const demo=this.mode==='demo';
    const source=demo?'Open-Meteo — simulação':'Open-Meteo';
    if(days<0||days>15) {
      const message=days<0?'A data do evento já passou.':'A previsão ainda não está disponível. Consulte novamente na janela de 16 dias.';
      return {...meta(source,demo),available:false,date,message};
    }
    const [longitude,latitude]=this.eventCoordinates(event);
    const forecast=demo
      ?{...meta(source,true),available:true,date,min:19,max:28,rainProbability:35,precipitation:2.4,timezone}
      :await this.cached(`weather:${latitude}:${longitude}:${date}`,async()=>{
        const params=new URLSearchParams({
          latitude:String(latitude),longitude:String(longitude),timezone,start_date:date,end_date:date,
          daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum'
        });
        const {daily}=await this.http.json(source,`https://api.open-meteo.com/v1/forecast?${params}`,forecastSchema);
        const index=daily.time.indexOf(date);
        if(index<0) return {...meta(source,false),available:false,date,message:'O Open-Meteo ainda não disponibilizou a previsão para essa data.'};
        const min=daily.temperature_2m_min[index],max=daily.temperature_2m_max[index];
        const rainProbability=daily.precipitation_probability_max[index],precipitation=daily.precipitation_sum[index];
        assert(min!=null&&max!=null&&min<=max&&rainProbability!=null&&precipitation!=null,'Open-Meteo: previsão incompleta ou inválida para essa data.');
        return {...meta(source,false),available:true,date,min,max,rainProbability,precipitation,timezone};
      });
    return {...forecast,rainAlert:event.outdoors==='aberto'&&typeof forecast.rainProbability==='number'&&forecast.rainProbability>50};
  }

  private orsKey():string {
    const key=process.env.OPENROUTESERVICE_API_KEY?.trim();
    assert(key,'Configure OPENROUTESERVICE_API_KEY no .env para consultar locais e rotas.');
    return key;
  }

  private async searchAddresses(address:string) {
    const params=new URLSearchParams({api_key:this.orsKey(),text:address,'boundary.country':'BR',size:'5'});
    const {features}=await this.http.json(orsName,`https://api.openrouteservice.org/geocode/search?${params}`,geocodeSchema,{},
      {401:'Chave inválida. Confira OPENROUTESERVICE_API_KEY.',403:'Chave inválida ou sem permissão para geocodificação.'});
    assert(features.length,'Nenhum local encontrado. Revise o endereço ou informe as coordenadas manualmente.');
    return features;
  }

  async geocode(raw:unknown):Promise<ApiReply> {
    await this.business.authorize('events');
    const address=this.parse(addressInput,raw,'Informe um endereço completo para localizar as coordenadas.');
    if(this.mode==='demo') return {...meta('openrouteservice — simulação',true),candidates:[{label:'Endereço demonstrativo — Campinas, SP',coordinates:[-47.0608,-22.9056]}]};
    return this.cached('geocode:'+address,async()=>{
      const features=await this.searchAddresses(address);
      return {...meta(orsSource,false),candidates:features.map(feature=>({
        label:feature.properties.label,coordinates:feature.geometry.coordinates
      }))};
    });
  }

  private async buffetOrigin() {
    this.orsKey();
    const cep=this.parse(cepSchema,process.env.BUFFET_ORIGIN_CEP??'13484332','Configure BUFFET_ORIGIN_CEP com oito dígitos.');
    const address=await this.lookupCep(cep);
    assert(address.logradouro,'O CEP de origem não identifica um logradouro. Confira BUFFET_ORIGIN_CEP.');
    // Número publicado pelo COTIL para o CEP de referência.
    const street=cep==='13484332'?`${address.logradouro}, 1888`:address.logradouro;
    const features=await this.searchAddresses(`${street}, ${address.localidade}, ${address.uf}, ${cep}`);
    const matches=features.filter(({properties})=>{
      const label=normalized(properties.label);
      return label.includes(normalized(address.localidade))&&(
        normalized(properties.street??'')===normalized(address.logradouro)||label.includes(normalized(address.logradouro)));
    });
    const exact=cep==='13484332'
      ?matches.find(({properties})=>properties.housenumber==='1888'||/\b1888\b/.test(properties.label))
      :undefined;
    const match=exact??matches[0];
    assert(match,'A sede do buffet não foi localizada. Confira o CEP de origem e tente novamente.');
    return match.geometry.coordinates;
  }

  async route(raw:unknown):Promise<ApiReply> {
    const data=this.parse(routeInput,raw,'Selecione um evento ou informe coordenadas válidas de origem e destino.');
    const demo=this.mode==='demo';
    let destination:z.infer<typeof coordinates>;
    if('eventId' in data) {
      await this.business.authorize('quotes',true);
      const event=await this.business.repo.find('events',data.eventId);
      if(normalized(String(event.city))==='limeira'&&String(event.state).toUpperCase()==='SP') {
        return {...meta('Regra de frete do buffet',demo),exempt:true,message:'Evento em Limeira (SP): frete isento.'};
      }
      destination=this.eventCoordinates(event);
    } else {
      await this.business.authorize('events');
      destination=data.destination;
    }
    if(demo) return {...meta('openrouteservice — simulação',true),km:18.4,minutes:32};
    const originCep=process.env.BUFFET_ORIGIN_CEP??'13484332';
    return this.cached('route:'+JSON.stringify([data,destination,originCep]),async()=>{
      const origin='origin' in data?data.origin:await this.buffetOrigin();
      const result=await this.http.json(orsName,'https://api.openrouteservice.org/v2/directions/driving-car/json',directionsSchema,{
        method:'POST',headers:{Authorization:this.orsKey(),'Content-Type':'application/json'},
        body:JSON.stringify({coordinates:[origin,destination]})
      },{
        400:'Não foi possível calcular a rota. Confira as coordenadas e a distância entre os pontos.',
        401:'Chave inválida. Confira OPENROUTESERVICE_API_KEY.',
        403:'Chave inválida ou sem permissão para rotas.',
        404:'Nenhuma rota rodoviária encontrada entre os locais.'
      });
      const summary=result.routes[0]?.summary;
      assert(summary,'Nenhuma rota rodoviária encontrada entre os locais.');
      return {...meta(orsSource,false),km:summary.distance/1000,minutes:summary.duration/60};
    });
  }

  async previewEmail(raw:unknown):Promise<EmailPreview> {
    const user=await this.business.authorize('quotes',true);
    const input=this.parse(emailInput,raw,'Selecione um orçamento e o tipo de e-mail.');
    const quote=await this.business.repo.find('quotes',input.quoteId);const event=await this.business.repo.find('events',Number(quote.event_id));
    assert(!['cancelado','concluido'].includes(String(event.status)),'Evento encerrado: envio indisponível.');
    assert(['rascunho','enviado','aprovado'].includes(String(quote.status)),'Este orçamento não pode ser enviado.');
    if(quote.status!=='aprovado')assert(String(quote.valid_until)>=today(),'Orçamento vencido: crie outra versão.');
    if(input.kind==='confirmacao') assert(quote.status==='aprovado'&&event.status==='confirmado','Confirmação exige orçamento aprovado e evento confirmado.');
    let savedSnapshot:unknown;
    try {savedSnapshot=JSON.parse(String(quote.snapshot));}
    catch {throw new BusinessError('Os dados da proposta estão inválidos.');}
    const snapshot=this.parse(snapshotSchema,savedSnapshot,'Os dados da proposta ou o e-mail do destinatário estão inválidos.');
    const currency=(n:unknown)=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const subject=`${input.kind==='confirmacao'?'Confirmação':'Orçamento'} · ${snapshot.event.name} · versão ${quote.version}`;
    const text=[`Olá, ${snapshot.client.name}!`,'',input.kind==='confirmacao'?'Confirmamos o evento conforme o orçamento aprovado.':'Segue o orçamento para seu evento.',`Evento: ${snapshot.event.name}`,`Data e horário: ${snapshot.event.starts_at} (horário de São Paulo)`,`Local: ${snapshot.event.venue} — ${snapshot.event.street}, ${snapshot.event.number}, ${snapshot.event.city}/${snapshot.event.state}`,`Convidados: ${snapshot.event.guests}`,'',...snapshot.items.map(item=>`${item.name}: ${item.quantity} ${item.unit} × ${currency(item.unit_price)}`),'',`Itens, equipe e fornecedores: ${currency(quote.subtotal)}`,`Frete estimado: ${currency(quote.freight)}`,`Outros serviços: ${currency(quote.extra)}`,`Desconto: ${currency(quote.discount)}`,`Total: ${currency(quote.total)}`,`Validade: ${quote.valid_until}`,`Condições: ${quote.notes||'Conforme negociação.'}`,'','Ateliê Buffet'].join('\n');
    const preview:EmailPreview={token:randomUUID(),to:snapshot.client.email,subject,text,demo:this.mode==='demo'};
    for(const [key,value] of this.previews) if(value.expires<Date.now()) this.previews.delete(key);
    assert(this.previews.size<100,'Feche as prévias antigas e tente novamente.');
    this.previews.set(preview.token,{preview,quoteId:quote.id,userId:user.id,kind:input.kind,fingerprint:fingerprint(quote),expires:Date.now()+10*60000});return preview;
  }
  private resendConfig() {
    const key=process.env.RESEND_API_KEY?.trim();
    assert(key,'Configure RESEND_API_KEY no .env para enviar e-mails.');
    const raw=process.env.RESEND_FROM_EMAIL?.trim();
    // Resend também aceita um nome de exibição antes do endereço.
    const mailbox=raw?.match(/^[^<>\r\n]+ <([^<>]+)>$/)?.[1]??raw;
    this.parse(emailAddress,mailbox,'Configure RESEND_FROM_EMAIL com um remetente autorizado no Resend.');
    assert(raw,'Configure RESEND_FROM_EMAIL no .env.');
    return {key,from:raw};
  }

  async sendEmail(raw:unknown):Promise<ApiReply> {
    const user=await this.business.authorize('quotes',true);
    const token=this.parse(z.uuid(),raw,'Confirme o envio a partir da prévia da mensagem.');
    const prepared=this.previews.get(token);
    assert(prepared&&prepared.userId===user.id&&prepared.expires>Date.now(),'Prévia expirada ou já utilizada. Revise a mensagem novamente.');
    const demo=this.mode==='demo';
    const config=demo?null:this.resendConfig();
    this.previews.delete(token);
    const db=this.business.repo.db;
    const attempt=await db.transaction(async()=>{
      const quote=await this.business.repo.find('quotes',prepared.quoteId);
      assert(fingerprint(quote)===prepared.fingerprint,'O orçamento mudou. Gere uma nova prévia.');
      const event=await this.business.repo.find('events',Number(quote.event_id));
      assert(!['cancelado','concluido'].includes(String(event.status)),'O evento foi encerrado.');
      if(quote.status!=='aprovado') assert(String(quote.valid_until)>=today(),'Orçamento vencido: crie outra versão.');
      if(prepared.kind==='confirmacao') assert(event.status==='confirmado'&&quote.status==='aprovado','O evento não está confirmado.');
      if(config) {
        const prior=await db.query(
          "SELECT status FROM email_attempts WHERE quote_id=? AND kind=? AND status IN ('aceito_provedor','pendente','resultado_incerto')",
          [prepared.quoteId,prepared.kind]
        );
        assert(!prior.some(row=>row.status==='aceito_provedor'),'Essa mensagem já foi aceita pelo Resend. Consulte o histórico.');
        assert(!prior.length,'Já existe um envio pendente ou incerto. Confira o histórico e o painel do Resend antes de qualquer reenvio.');
      }
      return db.execute('INSERT INTO email_attempts(quote_id,user_id,kind,status,provider_id,attempted_at) VALUES(?,?,?,?,?,?)',
        [prepared.quoteId,user.id,prepared.kind,'pendente',null,new Date().toISOString()]);
    });

    let id=`demo-${attempt}`;
    if(config) {
      const {to,subject,text}=prepared.preview;
      const body=JSON.stringify({from:config.from,to:[to],subject,text});
      const idempotencyKey=createHash('sha256').update(JSON.stringify([prepared.kind,prepared.fingerprint,body])).digest('hex');
      try {
        ({id}=await this.http.json('Resend','https://api.resend.com/emails',emailResponse,{
          method:'POST',
          headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
          body
        },{
          400:'A solicitação de e-mail foi rejeitada. Revise os dados e o remetente.',
          401:'Chave ausente ou inválida. Confira RESEND_API_KEY.',
          403:'Envio não autorizado. Confira a chave, o domínio verificado e o remetente no Resend.',
          409:'Conflito de idempotência. Confira o envio no painel do Resend.',
          422:'Mensagem rejeitada. Confira o destinatário e se o domínio do remetente foi verificado.'
        }));
      } catch(error) {
        const rejected=error instanceof ProviderHttpError&&[400,401,403,422,429].includes(error.status);
        await db.transaction(()=>db.execute('UPDATE email_attempts SET status=? WHERE id=?',
          [rejected?'falhou':'resultado_incerto',attempt]));
        if(rejected) throw error;
        const detail=error instanceof BusinessError?error.message:'Falha ao consultar o Resend.';
        throw new BusinessError(`${detail} O resultado do envio é incerto. Confira o painel do Resend.`);
      }
    }
    const status=demo?'simulado':'aceito_provedor';
    await db.transaction(async()=>{
      await db.execute('UPDATE email_attempts SET status=?,provider_id=? WHERE id=?',[status,id,attempt]);
      if(config&&prepared.kind==='orcamento') {
        await db.execute("UPDATE quotes SET status='enviado' WHERE id=? AND status='rascunho'",[prepared.quoteId]);
        await db.execute("UPDATE events SET status='orcamento_enviado' WHERE id=(SELECT event_id FROM quotes WHERE id=?) AND status='rascunho'",[prepared.quoteId]);
      }
    });
    return {...meta(demo?'Resend — simulação':'Resend',demo),status,providerId:id,
      message:demo?'Simulação registrada. Nenhum e-mail foi enviado.':'Mensagem aceita pelo Resend. Consulte o histórico para ver o ID do provedor.'};
  }
  async history():Promise<Row[]> {await this.business.authorize('quotes');return this.business.repo.db.query('SELECT * FROM email_attempts ORDER BY id DESC LIMIT 200');}
}

