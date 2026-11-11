import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import type {ApiReply,EmailPreview,Row} from '../../shared/models';
import {assert,asObject,today,validId,BusinessError} from '../../shared/validation';
import {BusinessService} from './business-service';

export async function requestJson(url:string,init:RequestInit={}):Promise<unknown> {
  try {
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(response.status===429) throw new BusinessError('O serviço atingiu o limite de consultas. Aguarde antes de tentar novamente.');
    assert(response.ok,`Serviço indisponível (HTTP ${response.status}). Verifique a configuração ou tente depois.`);
    assert(response.body,'O serviço retornou uma resposta vazia.');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true) {const {done,value}=await reader.read();if(done) break;size+=value.length;assert(size<=1024*1024,'Resposta do serviço excedeu o limite.');chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch(error) {
    if(error instanceof BusinessError) throw error;
    throw new BusinessError('Não foi possível consultar o serviço: tempo limite, rede ou resposta inválida.');
  }
}
export const coordinates=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
export const routeInput=z.object({origin:coordinates,destination:coordinates}).strict();
const meta=(source:string,demo:boolean):ApiReply=>({source,queriedAt:new Date().toISOString(),demo});
const fingerprint=(row:Row)=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
interface Prepared {preview:EmailPreview;quoteId:number;userId:number;kind:'orcamento'|'confirmacao';fingerprint:string;expires:number;}

export class IntegrationService {
  private previews=new Map<string,Prepared>();
  private cache=new Map<string,{expires:number;data:ApiReply}>();
  constructor(readonly business:BusinessService,readonly mode:'demo'|'live') {this.mode='demo';}
  private async cached(key:string,load:()=>Promise<ApiReply>):Promise<ApiReply> {
    const saved=this.cache.get(key);if(saved&&saved.expires>Date.now()) return {...saved.data,cached:true};
    const data=await load();if(this.cache.size>200) this.cache.clear();this.cache.set(key,{expires:Date.now()+15*60000,data});return data;
  }
  async cep(raw:unknown):Promise<ApiReply> {
    await this.business.auth.user();assert(typeof raw==='string'&&/^\d{5}-?\d{3}$/.test(raw),'Informe um CEP válido com oito dígitos.');
    const cep=raw.replace('-','');
    if(this.mode==='demo') return {...meta('ViaCEP · simulação',true),cep,street:'Praça de demonstração',district:'Centro',city:'Campinas',state:'SP'};
    return this.cached('cep:'+cep,async()=>{
      const result=z.object({erro:z.union([z.boolean(),z.string()]).optional(),logradouro:z.string().optional(),bairro:z.string().optional(),localidade:z.string().optional(),uf:z.string().optional()}).parse(await requestJson(`https://viacep.com.br/ws/${cep}/json/`));
      assert(!result.erro,'CEP não encontrado. Complete o endereço manualmente.');assert(result.localidade&&result.uf,'O serviço retornou um endereço incompleto.');
      return {...meta('ViaCEP',false),cep,street:result.logradouro||'',district:result.bairro||'',city:result.localidade,state:result.uf};
    });
  }
  async weather(raw:unknown):Promise<ApiReply> {
    await this.business.authorize('events');const event=await this.business.repo.find('events',validId(raw));
    assert(event.latitude!==null&&event.longitude!==null,'Informe as coordenadas do evento antes de consultar o clima.');
    const date=String(event.starts_at).slice(0,10),start=today();const days=Math.round((Date.parse(date)-Date.parse(start))/86400000);
    if(days<0||days>15) return {...meta('Open-Meteo',this.mode==='demo'),available:false,message:'Data fora da janela de previsão de até 16 dias. Consulte novamente perto do evento.'};
    if(this.mode==='demo') return {...meta('Open-Meteo · simulação',true),available:true,date,min:19,max:28,rainProbability:35,precipitation:2.4,timezone:'America/Sao_Paulo'};
    return this.cached(`weather:${event.latitude}:${event.longitude}:${date}`,async()=>{
      const params=new URLSearchParams({latitude:String(event.latitude),longitude:String(event.longitude),daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',timezone:'America/Sao_Paulo',start_date:date,end_date:date});
      const numbers=z.array(z.number().nullable());
      const result=z.object({daily:z.object({time:z.array(z.string()),temperature_2m_max:numbers,temperature_2m_min:numbers,precipitation_probability_max:numbers,precipitation_sum:numbers})}).parse(await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`));
      const i=result.daily.time.indexOf(date);assert(i>=0,'Não há previsão disponível para essa data.');
      const max=result.daily.temperature_2m_max[i],min=result.daily.temperature_2m_min[i];
      assert(max!=null&&min!=null,'Previsão incompleta para essa data.');
      return {...meta('Open-Meteo',false),available:true,date,min,max,rainProbability:result.daily.precipitation_probability_max[i]??null,precipitation:result.daily.precipitation_sum[i]??null,timezone:'America/Sao_Paulo'};
    });
  }
  private async gateway(path:string,body:unknown):Promise<unknown> {
    const base=process.env.GATEWAY_URL,token=process.env.GATEWAY_TOKEN;
    assert(base&&token,'Configure o gateway autenticado para usar rotas e envio real.');
    const url=new URL(base);assert(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)),'Use HTTPS no gateway fora do computador local.');
    return requestJson(new URL(path,url).href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  }
  async geocode(raw:unknown):Promise<ApiReply> {
    await this.business.authorize('events');const address=z.string().trim().min(8).max(300).parse(raw);
    if(this.mode==='demo') return {...meta('openrouteservice · simulação',true),candidates:[{label:'Endereço demonstrativo · Campinas, SP',coordinates:[-47.0608,-22.9056]}]};
    const result=z.object({candidates:z.array(z.object({label:z.string(),coordinates}))}).parse(await this.gateway('/geocode',{address}));
    assert(result.candidates.length,'Nenhum local encontrado. Informe as coordenadas manualmente.');return {...meta('openrouteservice / OpenStreetMap',false),...result};
  }
  async route(raw:unknown):Promise<ApiReply> {
    await this.business.authorize('events');const data=routeInput.parse(raw);
    if(this.mode==='demo') return {...meta('openrouteservice · simulação',true),km:18.4,minutes:32};
    const result=z.object({km:z.number().nonnegative().max(100000),minutes:z.number().nonnegative()}).parse(await this.gateway('/route',data));
    return {...meta('openrouteservice / OpenStreetMap',false),...result};
  }
  async previewEmail(raw:unknown):Promise<EmailPreview> {
    const user=await this.business.authorize('quotes',true);const input=z.object({quoteId:z.number().int().positive(),kind:z.enum(['orcamento','confirmacao'])}).strict().parse(raw);
    const quote=await this.business.repo.find('quotes',input.quoteId);const event=await this.business.repo.find('events',Number(quote.event_id));
    assert(!['cancelado','concluido'].includes(String(event.status)),'Evento encerrado: envio indisponível.');
    assert(['rascunho','enviado','aprovado'].includes(String(quote.status)),'Este orçamento não pode ser enviado.');
    if(quote.status!=='aprovado')assert(String(quote.valid_until)>=today(),'Orçamento vencido: crie outra versão.');
    if(input.kind==='confirmacao') assert(quote.status==='aprovado'&&event.status==='confirmado','Confirmação exige orçamento aprovado e evento confirmado.');
    const snapshot=JSON.parse(String(quote.snapshot)) as {client:Row;event:Row;items:Row[]};
    const currency=(n:unknown)=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const subject=`${input.kind==='confirmacao'?'Confirmação':'Orçamento'} · ${snapshot.event.name} · versão ${quote.version}`;
    const text=[`Olá, ${snapshot.client.name}!`,'',input.kind==='confirmacao'?'Confirmamos o evento conforme o orçamento aprovado.':'Segue o orçamento para seu evento.',`Evento: ${snapshot.event.name}`,`Data e horário: ${snapshot.event.starts_at} (horário de São Paulo)`,`Local: ${snapshot.event.venue}`,`Convidados: ${snapshot.event.guests}`,'',...snapshot.items.map(item=>`${item.name}: ${item.quantity} ${item.unit} × ${currency(item.unit_price)}`),'',`Itens, equipe e fornecedores: ${currency(quote.subtotal)}`,`Frete estimado: ${currency(quote.freight)}`,`Outros serviços: ${currency(quote.extra)}`,`Desconto: ${currency(quote.discount)}`,`Total: ${currency(quote.total)}`,`Validade: ${quote.valid_until}`,`Condições: ${quote.notes||'Conforme negociação.'}`,'','Ateliê Buffet'].join('\n');
    const preview:EmailPreview={token:randomUUID(),to:String(snapshot.client.email),subject,text,demo:this.mode==='demo'};
    for(const [key,value] of this.previews) if(value.expires<Date.now()) this.previews.delete(key);
    assert(this.previews.size<100,'Feche as prévias antigas e tente novamente.');
    this.previews.set(preview.token,{preview,quoteId:quote.id,userId:user.id,kind:input.kind,fingerprint:fingerprint(quote),expires:Date.now()+10*60000});return preview;
  }
  async sendEmail(raw:unknown):Promise<ApiReply> {
    const user=await this.business.authorize('quotes',true);const token=z.string().uuid().parse(raw);const prepared=this.previews.get(token);
    assert(prepared&&prepared.userId===user.id&&prepared.expires>Date.now(),'Prévia expirada ou já utilizada. Revise a mensagem novamente.');
    this.previews.delete(token);
    const db=this.business.repo.db;
    const attempt=await db.transaction(async()=>{
      const quote=await this.business.repo.find('quotes',prepared.quoteId);
      assert(fingerprint(quote)===prepared.fingerprint,'O orçamento mudou. Gere uma nova prévia.');
      const event=await this.business.repo.find('events',Number(quote.event_id));
      assert(!['cancelado','concluido'].includes(String(event.status)),'O evento foi encerrado.');
      if(prepared.kind==='confirmacao') assert(event.status==='confirmado'&&quote.status==='aprovado','O evento não está confirmado.');
      return db.execute('INSERT INTO email_attempts(quote_id,user_id,kind,status,provider_id,attempted_at) VALUES(?,?,?,?,?,?)',[prepared.quoteId,user.id,prepared.kind,'pendente',null,new Date().toISOString()]);
    });
    try {
      const result=this.mode==='demo'?{id:`demo-${attempt}`} : z.object({id:z.string().min(1).max(200)}).parse(await this.gateway('/email',{to:prepared.preview.to,subject:prepared.preview.subject,text:prepared.preview.text,idempotencyKey:token}));
      await db.transaction(async()=>{
        await db.execute('UPDATE email_attempts SET status=?,provider_id=? WHERE id=?',[this.mode==='demo'?'simulado':'aceito_provedor',result.id,attempt]);
        if(this.mode==='live') {await db.execute("UPDATE quotes SET status='enviado' WHERE id=? AND status='rascunho'",[prepared.quoteId]);await db.execute("UPDATE events SET status='orcamento_enviado' WHERE id=(SELECT event_id FROM quotes WHERE id=?) AND status='rascunho'",[prepared.quoteId]);}
      });
      return {...meta('Resend'+(this.mode==='demo'?' · simulação':''),this.mode==='demo'),status:this.mode==='demo'?'simulado':'aceito_provedor',message:this.mode==='demo'?'Simulação registrada. Nenhum e-mail foi enviado.':'Mensagem aceita pelo provedor. Isso não comprova entrega ou leitura.'};
    } catch(error) {
      await db.transaction(()=>db.execute("UPDATE email_attempts SET status='resultado_incerto' WHERE id=?",[attempt]));
      throw new BusinessError('Não foi possível confirmar o envio. Consulte o provedor antes de repetir, para evitar duplicidade.');
    }
  }
  async history():Promise<Row[]> {await this.business.authorize('quotes');return this.business.repo.db.query('SELECT * FROM email_attempts ORDER BY id DESC LIMIT 200');}
}

