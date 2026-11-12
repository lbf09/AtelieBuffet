import {EntityRepository} from '../repositories/entity-repository';
import {AuthService} from './auth-service';
import {type Entity,type Row,type User,type Value,type Dashboard} from '../../shared/models';
import {assert,Validator,validId,cents,decimal,today,lineTotal} from '../../shared/validation';

const operations:Entity[]=['events','menus','menu_items','menu_compositions','event_items','suppliers','event_suppliers','employees','event_staff'];
export class BusinessService {
  readonly validator=new Validator();
  constructor(readonly repo:EntityRepository,readonly auth:AuthService) {}
  async authorize(entity:Entity,write=false):Promise<User> {
    const user=(await this.auth.user())!;
    if(entity==='users') assert(user.role==='administrador','Apenas administradores gerenciam usuários.');
    if(user.role==='operacoes') assert(operations.includes(entity),'Este cadastro exige perfil de atendimento ou administrador.');
    if(user.role==='atendimento'&&write) assert(!['employees','event_staff'].includes(entity),'A escala é administrada pelo perfil de operações.');
    return user;
  }
  async list(entity:Entity):Promise<Row[]> {await this.authorize(entity);return this.repo.list(entity);}
  async save(entity:Entity,raw:unknown,id?:number):Promise<Row> {
    const user=await this.authorize(entity,true);if(id!==undefined) validId(id);
    const data=this.validator.entity(entity,raw,Boolean(id));
    return this.repo.db.transaction(async()=>{
      const existing=id?await this.repo.find(entity,id):undefined;
      for(const [key,value] of Object.entries(data)) {
        const target:Partial<Record<string,Entity>>={client_id:'clients',event_id:'events',item_id:'menu_items',menu_id:'menus',supplier_id:'suppliers',employee_id:'employees'};
        if(target[key]) {const parent=await this.repo.find(target[key]!,Number(value));assert(parent.status!=='inativo','Não é possível vincular um cadastro inativo.');}
      }
      if(entity==='users') await this.validateUser(data,existing,user);
      if(entity==='events') await this.validateEvent(data,existing,user);
      if(['event_items','event_suppliers','event_staff'].includes(entity)) {
        const event=await this.repo.find('events',Number(data.event_id));
        assert(!['concluido','cancelado'].includes(String(event.status)),'Este evento está encerrado. Seus vínculos não podem ser alterados.');
        if(existing&&existing.event_id!==data.event_id) {const previous=await this.repo.find('events',Number(existing.event_id));assert(!['concluido','cancelado'].includes(String(previous.status)),'O vínculo original pertence a evento encerrado.');}
      }
      if(entity==='event_staff') await this.validateStaff(data,id);
      if(entity==='quotes') await this.prepareQuote(data,existing,user);
      return this.repo.save(entity,data,id);
    });
  }
  private async validateUser(data:Record<string,Value>,old:Row|undefined,current:User):Promise<void> {
    assert(/^[a-zA-Z0-9_.@-]{3,80}$/.test(String(data.login)),'Login inválido. Use 3 a 80 letras, números, ponto, @, hífen ou sublinhado.');data.login=String(data.login).toLowerCase();
    if(data.password) data.password_hash=await this.auth.passwords.hash(data.password);
    else assert(old,'Defina uma senha com pelo menos 8 caracteres.');
    delete data.password;
    if(old?.id===current.id) assert(data.status==='ativo'&&data.role===old.role,'Você não pode desativar sua própria conta ou mudar seu próprio perfil.');
    if(old?.role==='administrador'&&(data.role!=='administrador'||data.status!=='ativo')) await this.keepAdmin(old.id);
  }
  private async keepAdmin(id:number):Promise<void> {const admins=await this.repo.db.query("SELECT id FROM users WHERE role='administrador' AND status='ativo' AND id<>?",[id]);assert(admins.length,'Mantenha pelo menos um administrador ativo.');}
  private async validateEvent(data:Record<string,Value>,old:Row|undefined,user:User):Promise<void> {
    if(user.role==='operacoes') {
      assert(old,'O cadastro de novos eventos exige atendimento ou administrador.');
      assert(Number(data.client_id)===Number(old.client_id),'A troca de cliente exige atendimento ou administrador.');
    }
    if(!old) assert(data.status==='rascunho','Crie eventos como rascunho.');
    if(old) {
      const transitions:Record<string,string[]>={rascunho:['orcamento_enviado','confirmado','cancelado'],orcamento_enviado:['confirmado','cancelado'],confirmado:['concluido','cancelado'],concluido:[],cancelado:[]};
      assert(old.status===data.status||transitions[String(old.status)].includes(String(data.status)),'Transição de situação não permitida.');
      assert(!['concluido','cancelado'].includes(String(old.status)),'Eventos encerrados preservam seus dados históricos.');
      if(user.role==='operacoes') assert(old.status===data.status||data.status==='concluido','Operações pode concluir eventos; confirmação e cancelamento exigem atendimento.');
      if(old.status!==data.status&&data.status==='confirmado') {
        const approved=await this.repo.db.query("SELECT id FROM quotes WHERE event_id=? AND status='aprovado'",[old.id]);assert(approved.length,'Aprove um orçamento antes de confirmar o evento.');
      }
      if(old.status!==data.status&&data.status==='orcamento_enviado') {
        const quotes=await this.repo.db.query("SELECT id FROM quotes WHERE event_id=? AND status IN ('enviado','aprovado')",[old.id]);assert(quotes.length,'Marque um orçamento como enviado ou aprovado primeiro.');
      }
      const staff=await this.repo.db.query('SELECT * FROM event_staff WHERE event_id=?',[old.id]);
      for(const shift of staff) {
        assert(String(data.setup_at)<=String(shift.starts_at)&&String(shift.ends_at)<=String(data.teardown_at),'Os novos horários deixariam uma escala fora da montagem/desmontagem. Ajuste a escala antes.');
      }
    }
  }
  private async validateStaff(data:Record<string,Value>,id?:number):Promise<void> {
    const event=await this.repo.find('events',Number(data.event_id));
    assert(String(data.starts_at)>=String(event.setup_at)&&String(data.ends_at)<=String(event.teardown_at),'A escala deve estar dentro do período de montagem e desmontagem do evento.');
    const conflicts=await this.repo.db.query("SELECT s.id FROM event_staff s JOIN events e ON e.id=s.event_id WHERE s.employee_id=? AND s.id<>? AND e.status<>'cancelado' AND s.starts_at<? AND s.ends_at>?",[data.employee_id,id||0,data.ends_at,data.starts_at]);
    assert(!conflicts.length,'Conflito de escala: esse funcionário já está ocupado no período.');
  }
  private async prepareQuote(data:Record<string,Value>,old:Row|undefined,user:User):Promise<void> {
    if(old) assert(Number(data.event_id)===Number(old.event_id),'Um orçamento não pode ser transferido para outro evento. Crie uma nova proposta.');
    const event=await this.repo.find('events',Number(data.event_id));
    assert(!['concluido','cancelado'].includes(String(event.status)),'Não é possível alterar orçamentos de eventos encerrados.');
    if(old&&old.status!=='rascunho'){
      const numeric=new Set(['event_id','freight_base','distance_km','rate_km','trips','extra','discount']);
      for(const key of Object.keys(data).filter(k=>k!=='status'))assert(numeric.has(key)?Number(old[key])===Number(data[key]):String(old[key])===String(data[key]),'Valores de orçamento enviado são imutáveis. Crie outra proposta.');
    }
    if(old){
      const transitions:Record<string,string[]>={rascunho:['rascunho','enviado'],enviado:['enviado','aprovado','recusado','expirado'],aprovado:['aprovado'],recusado:['recusado'],expirado:['expirado']};
      assert(transitions[String(old.status)].includes(String(data.status)),'Transição de orçamento não permitida.');
    }else assert(data.status==='rascunho','Crie um orçamento em rascunho.');
    if(data.status==='aprovado')assert(!(await this.repo.db.query("SELECT id FROM quotes WHERE event_id=? AND status='aprovado' AND id<>?",[event.id,old?.id||0])).length,'Já existe um orçamento aprovado para este evento.');
    if(data.status!=='aprovado')assert(String(data.valid_until)>=today(),'A validade do orçamento não pode estar no passado.');
    assert(String(data.valid_until)<=String(event.starts_at).slice(0,10),'A validade não pode ser posterior à data do evento.');
    const client=await this.repo.find('clients',Number(event.client_id));
    const items=await this.repo.db.query('SELECT i.name,i.unit,ei.quantity,ei.unit_price FROM event_items ei JOIN menu_items i ON i.id=ei.item_id WHERE ei.event_id=?',[event.id]);
    const suppliers=await this.repo.db.query("SELECT s.name,es.service,es.cost FROM event_suppliers es JOIN suppliers s ON s.id=es.supplier_id WHERE es.event_id=? AND es.status<>'cancelado'",[event.id]);
    const staff=await this.repo.db.query('SELECT f.name,es.job,es.cost FROM event_staff es JOIN employees f ON f.id=es.employee_id WHERE es.event_id=?',[event.id]);
    let subtotal=0;for(const item of items)subtotal+=lineTotal(item.quantity,item.unit_price);
    for(const line of [...suppliers,...staff])subtotal+=cents(line.cost);
    const draft=!old||old.status==='rascunho';
    const exempt=String(event.city).trim().toLowerCase()==='limeira'&&String(event.state).toUpperCase()==='SP';
    if(draft&&!exempt) data.trips=2;
    const freight=!draft ? cents(old.freight) : exempt ? 0
      : cents(data.freight_base)+lineTotal(Number(data.distance_km)*Number(data.trips),data.rate_km);
    const total=subtotal+freight+cents(data.extra)-cents(data.discount);
    assert(total>=0,'O desconto não pode superar o valor do orçamento.');
    const max=await this.repo.db.query('SELECT COALESCE(MAX(version),0) AS maximum FROM quotes WHERE event_id=?',[event.id]);
    data.version=old?.version||Number(max[0].maximum)+1;data.created_by=old?.created_by||user.id;
    data.subtotal=decimal(subtotal);data.freight=decimal(freight);data.total=decimal(total);
    data.snapshot=JSON.stringify({createdAt:new Date().toISOString(),event,client,items,suppliers,staff,freight:{base:data.freight_base,km:data.distance_km,rate:data.rate_km,trips:data.trips,source:data.distance_source},subtotal:data.subtotal,total:data.total});
  }
  async remove(entity:Entity,id:number):Promise<void> {
    const user=await this.authorize(entity,true);validId(id);
    if(entity==='events') assert(user.role!=='operacoes','A exclusão de eventos exige atendimento ou administrador.');
    await this.repo.db.transaction(async()=>{
      const old=await this.repo.find(entity,id);
      if(entity==='users') {assert(id!==user.id,'Você não pode excluir sua própria conta.');if(old.role==='administrador') await this.keepAdmin(id);}
      if(entity==='events') assert(old.status==='rascunho','Somente eventos em rascunho podem ser excluídos. Use cancelamento para preservar o histórico.');
      if(entity==='quotes') assert(old.status==='rascunho','Somente orçamentos em rascunho podem ser excluídos.');
      if(['event_items','event_suppliers','event_staff'].includes(entity)) {const event=await this.repo.find('events',Number(old.event_id));assert(!['concluido','cancelado'].includes(String(event.status)),'Vínculos de eventos encerrados preservam o histórico.');}
      // Excluir o lançamento preserva seu conteúdo no histórico e não reabre o evento.
      await this.repo.remove(entity,id);
    });
  }
  async dashboard():Promise<Dashboard> {
    const user=(await this.auth.user())!;
    const events=await this.repo.list('events');const active=events.filter(e=>!Number(e.archived)&&!['cancelado','concluido'].includes(String(e.status)));
    const quotes=user.role==='operacoes'?[]:(await this.repo.list('quotes')).filter(q=>!Number(q.archived));
    return {completed:events.filter(e=>e.status==='concluido').length,events:active.sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))),clients:user.role==='operacoes'?0:(await this.repo.list('clients')).length,activeEvents:active.length,guests:active.reduce((sum,e)=>sum+Number(e.guests),0),approved:quotes.filter(q=>q.status==='aprovado').reduce((sum,q)=>sum+Number(q.total),0),pipeline:quotes.filter(q=>['rascunho','enviado'].includes(String(q.status))).reduce((sum,q)=>sum+Number(q.total),0)};
  }
}

