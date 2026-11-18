import {EntityRepository} from '../repositories/entity-repository';
import {AuthService} from './auth-service';
import {PricingService} from './pricing-service';
import {type Entity,type Row,type User,type Value,type Dashboard,type CancellationPreview,type TechnicalData} from '../../shared/models';
import {assert,Validator,validId,cents,decimal,signedDecimal,today,lineTotal,asObject} from '../../shared/validation';

const operations:Entity[]=['events','event_menu_items','event_items','menus','menu_items','menu_compositions','suppliers','event_suppliers','employees','event_staff'];
const locked:Entity[]=['events','event_guests','event_menu_items','event_items','event_suppliers','event_staff'];
const open:Entity[]=['event_items','event_suppliers','event_staff','event_guests','event_menu_items'];
const closing=['concluido','cancelado'];

export class BusinessService {
  readonly validator=new Validator();
  readonly pricing:PricingService;
  constructor(readonly repo:EntityRepository,readonly auth:AuthService) {this.pricing=new PricingService(repo.db);}
  private get db(){return this.repo.db;}

  async authorize(entity:Entity,write=false):Promise<User> {
    const user=(await this.auth.user())!;
    if(entity==='users') assert(user.role==='administrador','Apenas administradores gerenciam usuários.');
    if(write&&entity==='employees') assert(user.role==='administrador','Apenas administradores gerenciam a equipe.');
    if(entity==='price_bands'||entity==='child_bands') assert(write?user.role==='administrador':user.role!=='operacoes','Tabelas de preço são administradas por administradores.');
    if(user.role==='operacoes') assert(operations.includes(entity),'Este cadastro exige perfil de atendimento ou administrador.');
    if(user.role==='atendimento'&&write) assert(!['employees','event_staff'].includes(entity),'A escala é administrada pelo perfil de operações.');
    return user;
  }

  async list(entity:Entity):Promise<Row[]> {await this.authorize(entity);return this.repo.list(entity);}

  async save(entity:Entity,raw:unknown,id?:number):Promise<Row> {
    const user=await this.authorize(entity,true);if(id!==undefined) validId(id);
    const data=this.validator.entity(entity,raw,Boolean(id));
    return this.db.transaction(async()=>{
      const existing=id?await this.repo.find(entity,id):undefined;
      for(const [key,value] of Object.entries(data)) {
        const target:Partial<Record<string,Entity>>={client_id:'clients',event_id:'events',item_id:'menu_items',menu_id:'menus',supplier_id:'suppliers',employee_id:'employees',child_band_id:'child_bands'};
        if(target[key]) {const parent=await this.repo.find(target[key]!,Number(value));assert(parent.status!=='inativo','Não é possível vincular um cadastro inativo.');}
      }
      if(entity==='users') await this.validateUser(data,existing,user);
      if(entity==='events') await this.prepareEvent(data,existing);
      if(open.includes(entity)) {
        const event=await this.repo.find('events',Number(data.event_id));
        assert(!closing.includes(String(event.status)),'Este evento está encerrado. Seus vínculos não podem ser alterados.');
        if(existing&&existing.event_id!==data.event_id) {const previous=await this.repo.find('events',Number(existing.event_id));assert(!closing.includes(String(previous.status)),'O vínculo original pertence a evento encerrado.');}
      }
      if(entity==='installments') await this.validateInstallment(data,existing);
      if(entity==='event_staff') await this.validateStaff(data,id);
      if(entity==='price_bands') await this.validatePriceBand(data,existing);
      if(entity==='child_bands') await this.validateChildBand(data,existing);
      if(entity==='quotes') await this.prepareQuote(data,existing,user);
      const saved=await this.repo.save(entity,data,id);
      if(entity==='event_guests') await this.syncGuests(Number(saved.event_id));
      if(entity==='events') await this.syncMenu(saved,existing);
      if(entity==='quotes') await this.afterQuote(saved,existing,user);
      return saved;
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
  private async keepAdmin(id:number):Promise<void> {const admins=await this.db.query("SELECT id FROM users WHERE role='administrador' AND status='ativo' AND id<>?",[id]);assert(admins.length,'Mantenha pelo menos um administrador ativo.');}

  private async prepareEvent(data:Record<string,Value>,old:Row|undefined):Promise<void> {
    const adults=Number(data.adults||0);
    const children=old?Number((await this.db.query('SELECT COALESCE(SUM(quantity),0) AS total FROM event_guests WHERE event_id=?',[old.id]))[0]?.total||0):0;
    data.guests=adults+children;
    assert(Number(data.guests)>=1,'Informe ao menos um adulto ou criança.');
    await this.validateEvent(data,old,(await this.auth.user())!);
  }

  private async validateEvent(data:Record<string,Value>,old:Row|undefined,user:User):Promise<void> {
    if(user.role==='operacoes') {
      assert(old,'O cadastro de novos eventos exige atendimento ou administrador.');
      assert(Number(data.client_id)===Number(old.client_id),'A troca de cliente exige atendimento ou administrador.');
    }
    if(!old) assert(data.status==='rascunho','Crie eventos como rascunho.');
    if(old) {
      if(data.status==='cancelado'&&old.status!=='cancelado') assert(false,'Use o cancelamento do evento para calcular multa e reembolso.');
      const transitions:Record<string,string[]>={rascunho:['orcamento_enviado','confirmado'],orcamento_enviado:['confirmado'],confirmado:['concluido'],concluido:[],cancelado:[]};
      assert(old.status===data.status||transitions[String(old.status)].includes(String(data.status)),'Transição de situação não permitida.');
      assert(!closing.includes(String(old.status)),'Eventos encerrados preservam seus dados históricos.');
      if(user.role==='operacoes') assert(old.status===data.status||data.status==='concluido','Operações pode concluir eventos; confirmação e cancelamento exigem atendimento.');
      if(old.status!==data.status&&data.status==='confirmado') {
        const approved=await this.db.query("SELECT * FROM quotes WHERE event_id=? AND status='aprovado'",[old.id]);
        assert(approved.length,'Aprove um orçamento antes de confirmar o evento.');
        const required=cents(String(approved[0].deposit_required||0));
        if(required>0) {
          const paid=await this.db.query("SELECT COALESCE(SUM(paid_amount),0) AS total FROM installments WHERE event_id=? AND kind='sinal'",[old.id]);
          assert(cents(String(paid[0]?.total||0))>=required,'Registre o pagamento do sinal antes de confirmar o evento.');
        }
      }
      if(old.status!==data.status&&data.status==='orcamento_enviado') {
        const quotes=await this.db.query("SELECT id FROM quotes WHERE event_id=? AND status IN ('enviado','aprovado')",[old.id]);assert(quotes.length,'Marque um orçamento como enviado ou aprovado primeiro.');
      }
      const staff=await this.db.query('SELECT * FROM event_staff WHERE event_id=?',[old.id]);
      for(const shift of staff) {
        assert(String(data.setup_at)<=String(shift.starts_at)&&String(shift.ends_at)<=String(data.teardown_at),'Os novos horários deixariam uma escala fora da montagem/desmontagem. Ajuste a escala antes.');
      }
    }
  }

  // Quantidades do cardápio são geradas ao escolher o cardápio e podem ser ajustadas depois.
  private async syncMenu(saved:Row,old:Row|undefined):Promise<void> {
    if(!saved.menu_id) return;
    const changed=!old||Number(old.menu_id)!==Number(saved.menu_id);
    const existing=await this.db.query('SELECT id FROM event_menu_items WHERE event_id=? LIMIT 1',[saved.id]);
    if(changed||!existing.length) await this.applyMenuRows(Number(saved.id),Number(saved.menu_id),Number(saved.guests));
  }
  private async applyMenuRows(eventId:number,menuId:number,guests:number):Promise<Row[]> {
    const compositions=await this.db.query('SELECT item_id,quantity FROM menu_compositions WHERE menu_id=?',[menuId]);
    await this.db.execute('DELETE FROM event_menu_items WHERE event_id=?',[eventId]);
    for(const row of compositions) {
      const quantity=Math.round(Number(row.quantity)*guests*1000)/1000;
      await this.db.execute('INSERT INTO event_menu_items(event_id,item_id,quantity) VALUES(?,?,?)',[eventId,Number(row.item_id),quantity]);
    }
    return this.db.query('SELECT * FROM event_menu_items WHERE event_id=? ORDER BY item_id',[eventId]);
  }
  async applyMenu(eventId:number):Promise<Row[]> {
    await this.authorize('events',true);
    const event=await this.repo.find('events',validId(eventId));
    assert(event.menu_id,'Selecione um cardápio para o evento.');
    assert(!closing.includes(String(event.status)),'Evento encerrado.');
    return this.db.transaction(()=>this.applyMenuRows(Number(event.id),Number(event.menu_id),Number(event.guests)));
  }
  private async syncGuests(eventId:number):Promise<void> {
    const event=await this.repo.find('events',eventId);
    const children=Number((await this.db.query('SELECT COALESCE(SUM(quantity),0) AS total FROM event_guests WHERE event_id=?',[eventId]))[0]?.total||0);
    const total=Number(event.adults)+children;
    assert(total>=1,'Informe ao menos um convidado.');
    await this.db.execute('UPDATE events SET guests=? WHERE id=?',[total,eventId]);
  }

  private async validateStaff(data:Record<string,Value>,id?:number):Promise<void> {
    const event=await this.repo.find('events',Number(data.event_id));
    assert(String(data.starts_at)>=String(event.setup_at)&&String(data.ends_at)<=String(event.teardown_at),'A escala deve estar dentro do período de montagem e desmontagem do evento.');
    // Conflitos só bloqueiam quando o evento está confirmado.
    if(String(event.status)!=='confirmado') return;
    const conflicts=await this.db.query("SELECT s.id FROM event_staff s JOIN events e ON e.id=s.event_id WHERE s.employee_id=? AND s.id<>? AND e.status<>'cancelado' AND s.starts_at<? AND s.ends_at>?",[data.employee_id,id||0,data.ends_at,data.starts_at]);
    assert(!conflicts.length,'Conflito de escala: esse funcionário já está ocupado no período.');
  }

  private async validatePriceBand(data:Record<string,Value>,old:Row|undefined):Promise<void> {
    assert(data.max_guests===null||Number(data.max_guests)>=Number(data.min_guests),'O máximo da faixa deve ser maior ou igual ao mínimo.');
    assert(Number(data.min_billing_guests||0)>=0,'O mínimo faturado não pode ser negativo.');
    const clash=await this.db.query('SELECT id FROM price_bands WHERE menu_id=? AND id<>? AND min_guests<=? AND (max_guests IS NULL OR max_guests>=?)',
      [data.menu_id,old?.id||0,data.max_guests===null?999999:Number(data.max_guests),Number(data.min_guests)]);
    assert(!clash.length,'Essa faixa se sobrepõe a outra do mesmo cardápio.');
  }
  private async validateChildBand(data:Record<string,Value>,old:Row|undefined):Promise<void> {
    assert(Number(data.max_age)>=Number(data.min_age),'A idade máxima deve ser maior ou igual à mínima.');
    if(data.status!=='ativo') return;
    const clash=await this.db.query("SELECT id FROM child_bands WHERE status='ativo' AND id<>? AND min_age<=? AND max_age>=?",[old?.id||0,Number(data.max_age),Number(data.min_age)]);
    assert(!clash.length,'Essa faixa de idade se sobrepõe a outra ativa.');
  }

  private async validateInstallment(data:Record<string,Value>,old:Row|undefined):Promise<void> {
    const event=await this.repo.find('events',Number(data.event_id));
    assert(!closing.includes(String(event.status)),'Evento encerrado: parcelas não podem ser alteradas.');
    assert(Number(data.paid_amount)<=Number(data.amount),'O valor pago não pode superar o valor da parcela.');
    if(old&&cents(String(old.paid_amount))>0) {
      const same=Number(data.amount)===Number(old.amount)&&Number(data.paid_amount)===Number(old.paid_amount)&&String(data.kind)===String(old.kind)&&String(data.due_date)===String(old.due_date);
      assert(same,'Parcelas já pagas preservam valor, vencimento e tipo. Ajuste apenas as observações.');
    }
    if(cents(String(data.paid_amount))>0&&!data.paid_at) data.paid_at=today();
  }

  async prepareQuote(data:Record<string,Value>,old:Row|undefined,user:User):Promise<void> {
    if(old) assert(Number(data.event_id)===Number(old.event_id),'Um orçamento não pode ser transferido para outro evento. Crie uma nova proposta.');
    const event=await this.repo.find('events',Number(data.event_id));
    assert(!closing.includes(String(event.status)),'Não é possível alterar orçamentos de eventos encerrados.');
    if(old){
      const transitions:Record<string,string[]>={rascunho:['rascunho','enviado'],enviado:['enviado','aprovado','recusado','expirado'],aprovado:['aprovado'],recusado:['recusado'],expirado:['expirado']};
      assert(transitions[String(old.status)].includes(String(data.status)),'Transição de orçamento não permitida.');
    }else assert(data.status==='rascunho','Crie um orçamento em rascunho.');
    if(data.status==='aprovado')assert(!(await this.db.query("SELECT id FROM quotes WHERE event_id=? AND status='aprovado' AND id<>?",[event.id,old?.id||0])).length,'Já existe um orçamento aprovado para este evento.');
    if(data.status!=='aprovado')assert(String(data.valid_until)>=today(),'A validade do orçamento não pode estar no passado.');
    assert(String(data.valid_until)<=String(event.starts_at).slice(0,10),'A validade não pode ser posterior à data do evento.');

    const client=await this.repo.find('clients',Number(event.client_id));
    const menuId=event.menu_id?Number(event.menu_id):null;
    const menu=menuId?await this.repo.find('menus',menuId):null;
    const adults=Number(event.adults||0);
    const childRows=await this.pricing.childCounts(Number(event.id));
    const packagePrice=await this.pricing.price(menuId,adults,childRows);

    const items=await this.db.query('SELECT i.name,i.unit,i.cost,ei.quantity,ei.unit_price FROM event_items ei JOIN menu_items i ON i.id=ei.item_id WHERE ei.event_id=?',[event.id]);
    let itemsSale=0,itemsCost=0;
    for(const item of items) {itemsSale+=lineTotal(item.quantity,item.unit_price);itemsCost+=lineTotal(item.quantity,item.cost??0);}

    let packageCost=0;
    if(packagePrice&&menuId) {
      const adjusted=await this.db.query('SELECT emi.quantity,i.cost FROM event_menu_items emi JOIN menu_items i ON i.id=emi.item_id WHERE emi.event_id=?',[event.id]);
      if(adjusted.length) for(const row of adjusted) packageCost+=lineTotal(row.quantity,row.cost??0);
      else {
        const composition=await this.db.query('SELECT mc.quantity,i.cost FROM menu_compositions mc JOIN menu_items i ON i.id=mc.item_id WHERE mc.menu_id=?',[menuId]);
        for(const row of composition) packageCost+=lineTotal(Number(row.quantity)*packagePrice.totalGuests,row.cost??0);
      }
    }

    const suppliers=await this.db.query("SELECT s.name,es.service,es.cost FROM event_suppliers es JOIN suppliers s ON s.id=es.supplier_id WHERE es.event_id=? AND es.status<>'cancelado'",[event.id]);
    const staff=await this.db.query('SELECT f.name,es.job,es.cost FROM event_staff es JOIN employees f ON f.id=es.employee_id WHERE es.event_id=?',[event.id]);
    let passThrough=0;for(const line of [...suppliers,...staff])passThrough+=cents(line.cost);

    const exempt=String(event.city).trim().toLowerCase()==='limeira'&&String(event.state).toUpperCase()==='SP';
    if(!exempt&&Number(data.trips)!==2) data.trips='2';
    const freight=exempt?0:lineTotal(Number(data.distance_km)*Number(data.trips),data.rate_km);
    const extra=cents(data.extra),discount=cents(data.discount);
    const productSale=packagePrice?packagePrice.packageAmount:itemsSale;
    const productCost=packagePrice?packageCost+itemsCost:itemsCost;
    const subtotal=productSale+(packagePrice?itemsSale:0)+passThrough;
    const revenue=subtotal+freight+extra-discount;
    assert(revenue>=0,'O desconto não pode superar o valor dos serviços.');
    const taxPercent=data.tax_percent===null||data.tax_percent===undefined?Number(old?.tax_percent??6):Number(data.tax_percent);
    const tax=Math.round(revenue*taxPercent/100);
    const total=revenue+tax;
    const cost=productCost+passThrough+freight;
    const margin=revenue-cost-tax;
    const depositPercent=data.deposit_percent===null||data.deposit_percent===undefined?Number(old?.deposit_percent??30):Number(data.deposit_percent);
    const deposit=Math.round(total*depositPercent/100);
    const children=packagePrice?packagePrice.totalGuests-adults:childRows.reduce((sum,child)=>sum+child.quantity,0);

    const max=await this.db.query('SELECT COALESCE(MAX(version),0) AS maximum FROM quotes WHERE event_id=?',[event.id]);
    data.version=old?.version||Number(max[0].maximum)+1;data.created_by=old?.created_by||user.id;
    data.freight_base=old?.freight_base??'0.00';
    data.extra=decimal(extra);data.discount=decimal(discount);
    data.menu_id=menuId;data.price_band_id=packagePrice?.bandId??null;
    data.adults=adults;data.children=children;
    data.adult_unit_price=decimal(packagePrice?.adultUnitPrice??0);
    data.child_amount=decimal(packagePrice?.childAmount??0);
    data.subtotal=decimal(subtotal);data.freight=decimal(freight);
    data.tax_percent=taxPercent;data.deposit_percent=depositPercent;
    data.tax_amount=decimal(tax);data.cost_amount=decimal(cost);data.margin_amount=signedDecimal(margin);
    data.deposit_required=decimal(deposit);data.total=decimal(total);
    data.snapshot=JSON.stringify({
      createdAt:new Date().toISOString(),event,client,menu,
      items,suppliers,staff,guests:{adults,children,childrenByBand:packagePrice?.childLines??childRows},
      pricing:packagePrice,freight:{km:data.distance_km,rate:data.rate_km,trips:data.trips,source:data.distance_source},
      cost:data.cost_amount,margin:data.margin_amount,tax:data.tax_amount,deposit:data.deposit_required,
      subtotal:data.subtotal,total:data.total
    });
  }

  private async afterQuote(saved:Row,old:Row|undefined,user:User):Promise<void> {
    if(old&&['enviado','aprovado'].includes(String(old.status))) {
      await this.db.execute('INSERT INTO change_history(quote_id,user_id,changed_at,before_json,after_json) VALUES(?,?,?,?,?)',
        [saved.id,user.id,new Date().toISOString(),JSON.stringify(old),JSON.stringify(saved)]);
    }
    if(old?.status!=='aprovado'&&saved.status==='aprovado') {
      const deposit=cents(String(saved.deposit_required));
      if(deposit>0) {
        const existing=await this.db.query("SELECT id FROM installments WHERE event_id=? AND kind='sinal'",[saved.event_id]);
        if(!existing.length) await this.db.execute("INSERT INTO installments(event_id,due_date,amount,paid_amount,paid_at,kind,notes) VALUES(?,?,?,?,NULL,'sinal',?)",
          [saved.event_id,today(),saved.deposit_required,'0.00','Sinal gerado na aprovação do orçamento.']);
      }
    }
    // Revisões de um orçamento aprovado mantêm o sinal em aberto alinhado ao novo valor.
    if(saved.status==='aprovado') {
      const deposit=cents(String(saved.deposit_required));
      const signs=await this.db.query("SELECT * FROM installments WHERE event_id=? AND kind='sinal' ORDER BY id",[saved.event_id]);
      const open=signs.find(row=>cents(String(row.paid_amount))===0);
      if(open&&deposit>0&&cents(String(open.amount))!==deposit)
        await this.db.execute('UPDATE installments SET amount=? WHERE id=?',[decimal(deposit),open.id]);
    }
  }

  async remove(entity:Entity,id:number):Promise<void> {
    const user=await this.authorize(entity,true);validId(id);
    if(entity==='events') assert(user.role!=='operacoes','A exclusão de eventos exige atendimento ou administrador.');
    await this.db.transaction(async()=>{
      const old=await this.repo.find(entity,id);
      if(entity==='users') {assert(id!==user.id,'Você não pode excluir sua própria conta.');if(old.role==='administrador') await this.keepAdmin(id);}
      if(entity==='events') assert(old.status==='rascunho','Somente eventos em rascunho podem ser excluídos. Use cancelamento ou arquivamento para preservar o histórico.');
      if(entity==='quotes') assert(old.status==='rascunho','Somente orçamentos em rascunho podem ser excluídos. Use arquivamento para preservar o histórico.');
      if(entity==='installments') assert(cents(String(old.paid_amount))===0,'Parcelas pagas preservam o histórico.');
      if(locked.includes(entity)) {const event=await this.repo.find('events',Number(old.event_id));assert(!closing.includes(String(event.status)),'Vínculos de eventos encerrados preservam o histórico.');}
      await this.repo.remove(entity,id);
      if(entity==='event_guests') await this.syncGuests(Number(old.event_id));
    });
  }

  async archive(entity:'events'|'quotes',id:number,archived:boolean):Promise<void> {
    const user=await this.authorize(entity,true);validId(id);await this.repo.find(entity,id);
    if(entity==='events') assert(user.role!=='operacoes','O arquivamento de eventos exige atendimento ou administrador.');
    await this.db.execute(`UPDATE ${entity} SET archived=? WHERE id=?`,[archived?1:0,id]);
  }

  private cancellationPercent(days:number):number {
    if(days>=30) return 10;
    if(days>=15) return 30;
    if(days>=7) return 50;
    return 100;
  }
  async previewCancellation(eventId:number):Promise<CancellationPreview> {
    await this.authorize('events',true);
    const event=await this.repo.find('events',validId(eventId));
    assert(!closing.includes(String(event.status)),'Este evento não pode ser cancelado.');
    const days=Math.floor((Date.parse(String(event.starts_at).slice(0,10))-Date.parse(today()))/86400000);
    const paid=cents(String((await this.db.query('SELECT COALESCE(SUM(paid_amount),0) AS total FROM installments WHERE event_id=?',[eventId]))[0]?.total||0));
    const percent=this.cancellationPercent(days);
    const penalty=Math.round(paid*percent/100);
    return {days,percent,paid:decimal(paid),penalty:decimal(penalty),refund:decimal(paid-penalty)};
  }
  async cancelEvent(raw:unknown):Promise<Row> {
    const user=await this.authorize('events',true);
    assert(user.role!=='operacoes','O cancelamento exige atendimento ou administrador.');
    const input=asObject(raw);
    const eventId=validId(Number(input.eventId));
    const reason=String(input.reason??'').trim();
    assert(reason.length>=3&&reason.length<=1000,'Informe o motivo do cancelamento.');
    const preview=await this.previewCancellation(eventId);
    const penalty=input.penalty!==undefined&&input.penalty!==''?cents(input.penalty):cents(preview.penalty);
    const refund=input.refund!==undefined&&input.refund!==''?cents(input.refund):Math.max(0,cents(preview.paid)-penalty);
    assert(penalty+refund<=cents(preview.paid),'A multa e o reembolso não podem superar o valor já pago.');
    const id=await this.db.transaction(async()=>{
      await this.db.execute("UPDATE events SET status='cancelado' WHERE id=?",[eventId]);
      return this.db.execute('INSERT INTO cancellations(event_id,user_id,cancelled_at,penalty_amount,refund_amount,reason) VALUES(?,?,?,?,?,?)',
        [eventId,user.id,new Date().toISOString(),decimal(penalty),decimal(refund),reason]);
    });
    return (await this.db.query('SELECT * FROM cancellations WHERE id=?',[id]))[0];
  }
  async cancellations():Promise<Row[]> {await this.authorize('events');return this.db.query('SELECT * FROM cancellations ORDER BY id DESC');}
  async changeHistory(quoteId:number):Promise<Row[]> {
    await this.authorize('quotes');validId(quoteId);
    return this.db.query('SELECT * FROM change_history WHERE quote_id=? ORDER BY id DESC',[quoteId]);
  }
  async financePlan(raw:unknown):Promise<Row[]> {
    await this.authorize('installments',true);
    const input=asObject(raw);
    const eventId=validId(Number(input.eventId)),count=Number(input.count);
    assert(Number.isInteger(count)&&count>=0&&count<=24,'Informe de 0 a 24 parcelas.');
    const event=await this.repo.find('events',eventId);
    assert(!closing.includes(String(event.status)),'Evento encerrado.');
    const quotes=await this.db.query("SELECT * FROM quotes WHERE event_id=? AND status='aprovado' ORDER BY version DESC LIMIT 1",[eventId]);
    assert(quotes.length,'Aprove um orçamento antes de gerar as parcelas.');
    const total=cents(String(quotes[0].total)),deposit=cents(String(quotes[0].deposit_required));
    await this.db.transaction(async()=>{
      // Parcelas pagas preservam o histórico; apenas as em aberto são recalculadas.
      await this.db.execute('DELETE FROM installments WHERE event_id=? AND paid_amount=0',[eventId]);
      const sign=await this.db.query("SELECT id FROM installments WHERE event_id=? AND kind='sinal'",[eventId]);
      if(!sign.length&&deposit>0) await this.db.execute("INSERT INTO installments(event_id,due_date,amount,paid_amount,paid_at,kind,notes) VALUES(?,?,?,?,NULL,'sinal',?)",
        [eventId,today(),decimal(deposit),'0.00','Sinal previsto no orçamento aprovado.']);
      const covered=await this.db.query('SELECT COALESCE(SUM(amount),0) AS total FROM installments WHERE event_id=?',[eventId]);
      const remaining=Math.max(0,total-cents(String(covered[0]?.total||0)));
      if(count>0&&remaining>0) {
        const base=Math.floor(remaining/count);const rest=remaining-base*count;
        const start=new Date();
        for(let i=1;i<=count;i++) {
          const due=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,1));
          const amount=base+(i===count?rest:0);
          await this.db.execute("INSERT INTO installments(event_id,due_date,amount,paid_amount,paid_at,kind,notes) VALUES(?,?,?,?,NULL,'parcela',?)",
            [eventId,due.toISOString().slice(0,10),decimal(amount),'0.00',`Parcela ${i} de ${count}.`]);
        }
      }
    });
    return this.db.query('SELECT * FROM installments WHERE event_id=? ORDER BY due_date,id',[eventId]);
  }
  async technical():Promise<TechnicalData> {
    const user=(await this.auth.user())!;
    assert(user.role==='administrador','Apenas administradores consultam os dados técnicos.');
    const migrations=await this.db.query('SELECT version,applied_at FROM schema_migrations ORDER BY version');
    const attempts=await this.db.query('SELECT * FROM email_attempts ORDER BY id DESC LIMIT 200');
    return {migrations,attempts};
  }

  async dashboard():Promise<Dashboard> {
    const user=(await this.auth.user())!;
    const events=await this.repo.list('events');const active=events.filter(e=>!Number(e.archived)&&!closing.includes(String(e.status)));
    const quotes=user.role==='operacoes'?[]:(await this.repo.list('quotes')).filter(q=>!Number(q.archived));
    return {completed:events.filter(e=>e.status==='concluido').length,events:active.sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))),clients:user.role==='operacoes'?0:(await this.repo.list('clients')).length,activeEvents:active.length,guests:active.reduce((sum,e)=>sum+Number(e.guests),0),approved:quotes.filter(q=>q.status==='aprovado').reduce((sum,q)=>sum+Number(q.total),0),pipeline:quotes.filter(q=>['rascunho','enviado'].includes(String(q.status))).reduce((sum,q)=>sum+Number(q.total),0)};
  }
}
