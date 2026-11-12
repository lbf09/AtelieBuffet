import {definition, entities, entityNames, type ApiReply, type AppInfo, type Entity, type Field, type Input, type Result, type Row} from '../shared/models';
import {escapeHtml as h, money, dateTime, label, badge, icon} from './format';

type View = Entity | 'dashboard' | 'history';
const operations:Entity[]=['events','menus','menu_items','menu_compositions','event_items','suppliers','event_suppliers','employees','event_staff'];
const descriptions:Partial<Record<View,string>>={
  clients:'Pessoas e empresas que confiam suas celebrações a você.',events:'Do primeiro contato ao último detalhe da desmontagem.',
  menus:'Organize suas propostas gastronômicas.',menu_items:'Sabores, preços e informações sobre alérgenos.',menu_compositions:'Escolha os itens e as quantidades sugeridas de cada cardápio.',
  event_items:'Itens contratados, com quantidade e preço preservados por evento.',suppliers:'Parceiros para completar cada celebração.',
  event_suppliers:'Serviços e valores negociados com seus parceiros.',employees:'As pessoas que fazem tudo acontecer.',event_staff:'Organize horários e evite conflitos de agenda.',
  quotes:'Reúna os custos e prepare uma proposta para seu cliente.',users:'Gerencie quem pode acessar seu ateliê.'
};
const navIcons:Partial<Record<Entity,string>>={events:'calendar',clients:'people',menus:'menu',menu_items:'menu',suppliers:'box',employees:'people',quotes:'quote',users:'people'};
const api=window.buffet;
const unwrap = <T>(result:Result<T>):T => {if(!result.ok) throw new Error(result.error);return result.data;};

class BuffetApp {
  private root=document.querySelector<HTMLDivElement>('#app')!;
  private editor=document.querySelector<HTMLDialogElement>('#editor')!;
  private confirm=document.querySelector<HTMLDialogElement>('#confirm')!;
  private info!:AppInfo;
  private view:View='dashboard';
  private rows:Row[]=[];
  private refs:Partial<Record<Entity,Row[]>>={};
  private page=0;
  private scope?:{key:string;id:number;name:string};
  private version=0;
  private toastTimer=0;
  private weatherTimer=0;

  async start():Promise<void> {
    this.info=unwrap(await api.info());
    if(!this.info.user) this.login();else await this.shell();
  }
  private async act(work:()=>Promise<void>,button?:HTMLButtonElement,errorBox?:HTMLElement):Promise<void> {
    if(button?.disabled) return;
    if(button) button.disabled=true;
    if(errorBox) {errorBox.hidden=true;errorBox.textContent='';}
    try {await work();} catch(error) {
      const message=error instanceof Error?error.message:'Não foi possível concluir a operação.';
      if(errorBox) {errorBox.hidden=false;errorBox.textContent=message;errorBox.scrollIntoView({block:'nearest'});} else this.toast(message,true);
      if(message.includes('sessão terminou')) {this.editor.close();this.confirm.close();await this.start();}
    } finally {if(button) button.disabled=false;}
  }
  private toast(message:string,error=false):void {
    const toast=document.querySelector<HTMLDivElement>('#toast')!;
    window.clearTimeout(this.toastTimer);toast.textContent=message;toast.classList.toggle('error',error);toast.hidden=false;
    this.toastTimer=window.setTimeout(()=>toast.hidden=true,error?9000:6000);
  }
  private canRead(entity:Entity):boolean {
    const role=this.info.user?.role;
    return role==='administrador'||(entity!=='users'&&(role!=='operacoes'||operations.includes(entity)));
  }
  private canWrite(entity:Entity,creating=false):boolean {
    return this.canRead(entity)&&!(this.info.user?.role==='atendimento'&&['employees','event_staff'].includes(entity))&&!(creating&&entity==='events'&&this.info.user?.role==='operacoes');
  }
  private login():void {
    const setup=this.info.needsSetup;
    this.root.innerHTML=`<div class="login-layout"><section class="login-story"><div class="brand">${icon('menu')} Ateliê <span>Buffet</span></div><div><h1>Cada encontro<br>começa com<br>um bom plano.</h1><p>Clientes, sabores e pessoas.<br>Todos os detalhes, no mesmo lugar.</p></div><span>Gestão de festas e eventos</span></section><main class="login-panel"><form id="auth-form"><span class="pill">${this.info.mode==='demo'?'Demonstração local':'Seu espaço de trabalho'}</span><h2>${setup?'Vamos abrir seu ateliê':'Bom ter você aqui'}</h2><p>${setup?'Cadastre o primeiro administrador para começar.':'Entre para acompanhar os próximos encontros.'}</p>${setup?'<label for="auth-name">Seu nome</label><input class="form-control" id="auth-name" name="name" required maxlength="200" autocomplete="name">':''}<label for="auth-login">Login</label><input class="form-control" id="auth-login" name="login" required minlength="3" maxlength="80" autocomplete="username"><label for="auth-password">Senha</label><input class="form-control" id="auth-password" name="password" type="password" required ${setup?'minlength="8"':''} maxlength="128" autocomplete="${setup?'new-password':'current-password'}">${setup?'<small>Use de 8 a 128 caracteres. Não há senha padrão.</small>':''}<p class="form-error" role="alert" hidden></p><button class="btn btn-primary auth-submit" type="submit">${setup?'Criar administrador':'Entrar no ateliê'} ${icon('arrow')}</button><p class="login-foot">${this.info.apiMode==='demo'?'Integrações simuladas. Nenhum e-mail será enviado.':'Acesso restrito à equipe autorizada.'}</p></form></main></div>`;
    const form=this.root.querySelector<HTMLFormElement>('form')!;
    form.addEventListener('submit',event=>{event.preventDefault();void this.act(async()=>{
      const data=Object.fromEntries(new FormData(form)) as Record<string,string>;
      this.info.user=unwrap(setup?await api.setup({name:data.name,login:data.login,password:data.password}):await api.login({login:data.login,password:data.password}));
      this.info.needsSetup=false;await this.shell();
    },form.querySelector('button')!,form.querySelector<HTMLElement>('.form-error')!);});
  }
  private async shell():Promise<void> {
    const user=this.info.user!;
    const groups=['Planejamento','Relacionamento','Catálogo','Operação','Financeiro','Administração'];
    this.root.innerHTML=`<div class="workspace"><aside class="sidebar"><div class="brand">${icon('menu')}<div>Ateliê <span>Buffet</span></div></div><nav aria-label="Navegação principal"><button data-view="dashboard" class="nav-item">${icon('home')} Visão geral</button>${groups.map(group=>{
      const names=entityNames.filter(e=>definition(e).group===group&&this.canRead(e));
      return names.length?`<div class="nav-group">${group}</div>${names.map(e=>`<button data-view="${e}" class="nav-item">${icon(navIcons[e]||'link')} ${h(definition(e).label)}</button>`).join('')}`:'';
    }).join('')}${this.canRead('quotes')?`<button data-view="history" class="nav-item">${icon('mail')} Histórico de e-mails</button>`:''}</nav><div class="profile"><div class="avatar">${h(user.name.slice(0,1).toUpperCase())}</div><div><strong>${h(user.name)}</strong><small>${label(user.role)}</small></div><button id="logout" class="icon-button" aria-label="Sair da conta" title="Sair da conta">${icon('logout')}</button></div></aside><div class="workspace-main"><header class="topbar"><span id="breadcrumb">Seu ateliê / Visão geral</span><span class="mode-indicator">${this.info.apiMode==='demo'?'Demonstração • APIs simuladas':'Integrações reais'}<span class="mode-dot"></span></span></header><main id="content" tabindex="-1"></main><footer class="workspace-footer">Ateliê Buffet <span>Feito para cuidar dos detalhes.</span></footer></div></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>void this.act(()=>this.navigate(button.dataset.view as View))));
    this.root.querySelector<HTMLButtonElement>('#logout')!.addEventListener('click',()=>void this.act(async()=>{window.clearInterval(this.weatherTimer);unwrap(await api.logout());this.refs={};this.rows=[];await this.start();}));
    await this.navigate('dashboard');
  }
  private content():HTMLElement {return this.root.querySelector('#content')!;}
  private async navigate(view:View,scope?:{key:string;id:number;name:string}):Promise<void> {
    const version=++this.version;this.view=view;this.scope=scope;this.page=0;
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    this.root.querySelector('#breadcrumb')!.textContent=`Seu ateliê / ${view==='dashboard'?'Visão geral':view==='history'?'Histórico de e-mails':definition(view).label}`;
    this.content().innerHTML='<p class="loading" role="status">Carregando…</p>';
    if(view==='dashboard') {await this.dashboard(version);return;}
    if(view==='history') {await this.history(version);return;}
    const refNames=[...new Set(definition(view).fields.flatMap(f=>f.ref&&this.canRead(f.ref)?[f.ref]:[]))];
    const [rows,...references]=await Promise.all([api[view].list(),...refNames.map(e=>api[e].list())]);
    if(version!==this.version)return;
    this.rows=unwrap(rows);this.refs={};refNames.forEach((e,i)=>this.refs[e]=unwrap(references[i]));
    this.content().innerHTML=`<div class="page-heading"><div><h1>${h(definition(view).label)}</h1><p>${h(descriptions[view])}</p></div><div class="actions">${view==='quotes'?'<button class="btn btn-secondary" id="export">Exportar relatório</button>':''}${this.canWrite(view,true)?`<button class="btn btn-primary" id="new">${icon('plus')} Novo cadastro</button>`:''}</div></div>${scope?`<div class="scope-banner">Exibindo vínculos de <strong>${h(scope.name)}</strong><button id="clear-scope" class="text-button">Mostrar todos</button></div>`:''}<section class="table-panel"><div class="table-toolbar"><div class="search-box">${icon('search')}<input id="search" type="search" placeholder="Buscar em ${h(definition(view).label.toLocaleLowerCase('pt-BR'))}" aria-label="Buscar registros"></div>${definition(view).fields.find(f=>f.key==='status')?`<select id="status-filter" class="form-select" aria-label="Filtrar por situação"><option value="">Todas as situações</option>${definition(view).fields.find(f=>f.key==='status')!.options!.map(x=>`<option value="${x}">${label(x)}</option>`).join('')}</select>`:''}<span id="record-count"></span></div><div id="table-area"></div></section>`;
    this.content().querySelector('#new')?.addEventListener('click',()=>void this.act(()=>this.edit(view)));
    this.content().querySelector('#export')?.addEventListener('click',event=>void this.act(async()=>this.toast(unwrap(await api.exportReport())),event.currentTarget as HTMLButtonElement));
    this.content().querySelector('#clear-scope')?.addEventListener('click',()=>void this.act(()=>this.navigate(view)));
    this.content().querySelector('#search')?.addEventListener('input',()=>{this.page=0;this.table(view);});
    this.content().querySelector('#status-filter')?.addEventListener('change',()=>{this.page=0;this.table(view);});
    this.table(view);
  }
  private display(entity:Entity,key:string,row:Row):string {
    const field=definition(entity).fields.find(f=>f.key===key),value=row[key];
    if(field?.ref) {const related=this.refs[field.ref]?.find(r=>r.id===Number(value));return String(related?.name||related?.service||`#${value}`);}
    if(field?.type==='money'||key==='total') return money(value);
    if(field?.type==='date'||field?.type==='datetime-local')return dateTime(value);
    return label(value);
  }
  private table(entity:Entity):void {
    const search=this.content().querySelector<HTMLInputElement>('#search')!.value.toLocaleLowerCase('pt-BR');
    const status=this.content().querySelector<HTMLSelectElement>('#status-filter')?.value||'';
    const columns=definition(entity).columns;
    const filtered=this.rows.filter(row=>(!this.scope||Number(row[this.scope.key])===this.scope.id)&&(!status||row.status===status)&&columns.some(k=>this.display(entity,k,row).toLocaleLowerCase('pt-BR').includes(search)));
    this.page=Math.min(this.page,Math.max(0,Math.ceil(filtered.length/12)-1));
    this.content().querySelector('#record-count')!.textContent=`${filtered.length} registro${filtered.length===1?'':'s'}`;
    this.content().querySelector('#table-area')!.innerHTML=filtered.length?`<div class="table-scroll"><table class="data-table"><thead><tr>${columns.map(k=>`<th>${h(definition(entity).fields.find(f=>f.key===k)?.label||({total:'Total',version:'Versão'}[k as 'total']||k))}</th>`).join('')}<th class="actions-heading">Ações</th></tr></thead><tbody>${filtered.slice(this.page*12,this.page*12+12).map(row=>`<tr>${columns.map((k,i)=>`<td${i===0?' class="primary-cell"':''}>${k==='status'?badge(row[k]):h(this.display(entity,k,row))}</td>`).join('')}<td><div class="row-actions">${entity==='events'?`<button class="text-button" data-action="detail" data-id="${row.id}">Detalhes</button>`:''}${entity==='quotes'?`<button class="text-button" data-action="preview" data-id="${row.id}">Ver proposta</button><button class="text-button" data-action="version" data-id="${row.id}">Nova versão</button>`:''}${this.canWrite(entity)?`<button class="text-button" data-action="edit" data-id="${row.id}">Editar</button><button class="text-button danger" data-action="delete" data-id="${row.id}">Excluir</button>`:''}</div></td></tr>`).join('')}</tbody></table></div><div class="pagination-bar"><span>Página ${this.page+1} de ${Math.ceil(filtered.length/12)}</span><div><button class="btn btn-secondary btn-sm" id="prev" ${this.page===0?'disabled':''}>Anterior</button><button class="btn btn-secondary btn-sm" id="next" ${(this.page+1)*12>=filtered.length?'disabled':''}>Próxima</button></div></div>`:`<div class="empty-state">${icon(navIcons[entity]||'box')}<h2>${search||status?'Nenhum resultado':'Nenhum cadastro ainda'}</h2><p>${search||status?'Ajuste a busca ou o filtro para encontrar o registro.':'Use “Novo cadastro” para adicionar o primeiro registro.'}</p></div>`;
    this.content().querySelector('#prev')?.addEventListener('click',()=>{this.page--;this.table(entity);});
    this.content().querySelector('#next')?.addEventListener('click',()=>{this.page++;this.table(entity);});
    if(entity==='events'&&this.info.user?.role==='operacoes')this.content().querySelectorAll('[data-action="delete"]').forEach(button=>button.remove());
    this.content().querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.addEventListener('click',()=>void this.act(async()=>{
      const row=this.rows.find(r=>r.id===Number(button.dataset.id))!;
      switch(button.dataset.action){
        case 'edit':await this.edit(entity,row);break;
        case 'delete':this.deleteDialog(entity,row);break;
        case 'detail':await this.eventDetail(row);break;
        case 'preview':this.quoteDetail(row);break;
        case 'version':await this.edit(entity,undefined,{...row,status:'rascunho'});break;
      }
    },button)));
  }
  private async dashboard(version:number):Promise<void> {
    const data=unwrap(await api.dashboard());if(version!==this.version)return;
    const events=data.events.slice(0,5),date=new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date());
    this.content().innerHTML=`<div class="page-heading"><div><h1>Agenda do buffet</h1><p>Planeje os próximos encontros e acompanhe a operação em ${h(date)}.</p></div>${this.canWrite('events',true)?`<button class="btn btn-primary" id="new-event">${icon('plus')} Criar evento</button>`:''}</div><section class="overview-strip" aria-label="Resumo do ateliê"><div><span>Eventos em planejamento</span><strong>${data.activeEvents.toLocaleString('pt-BR')}</strong><small>Encontros para preparar</small></div><div><span>Convidados esperados</span><strong>${data.guests.toLocaleString('pt-BR')}</strong><small>Nos eventos em aberto</small></div><div><span>${this.canRead('quotes')?'Propostas aprovadas':'Organização'}</span><strong>${this.canRead('quotes')?money(data.approved):'Tudo em equipe'}</strong><small>${this.canRead('quotes')?'Soma dos orçamentos aprovados':'Consulte as escalas e os parceiros'}</small></div></section><div class="dashboard-grid"><section class="agenda"><div class="section-heading"><div><h2>Na agenda</h2><p>Os próximos eventos do seu buffet</p></div><button class="text-button" id="all-events">Ver todos ${icon('arrow')}</button></div>${events.length?events.map(e=>{
      const date=String(e.starts_at),month=new Date(date.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
      return `<button class="agenda-event" data-event="${e.id}"><div class="date-tile"><strong>${date.slice(8,10)}</strong><span>${h(month)}</span></div><div class="agenda-copy"><span class="event-type">${h(label(e.type))}</span><h3>${h(e.name)}</h3><p>${h(e.venue)} <span>•</span> ${e.guests} convidados</p></div><div class="agenda-meta">${badge(e.status)}<small>${date.slice(11,16)}${e.outdoors==='aberto'?' • Ao ar livre':''}</small></div>${icon('arrow')}</button>`;
    }).join(''):'<div class="empty-state"><h3>A agenda está livre</h3><p>Cadastre um cliente e prepare seu primeiro evento.</p></div>'}</section><aside class="planning-note"><div class="note-icon">${icon('menu')}</div><h2>Prepare o próximo evento</h2><p>Da proposta à recepção, acompanhe o que falta.</p><ol><li>Cadastre o cliente e o evento.</li><li>Escolha os itens e os parceiros.</li><li>Organize a equipe e seus horários.</li><li>Monte e revise o orçamento.</li></ol><div class="note-footer">${this.info.apiMode==='demo'?'Você está em uma demonstração. Endereços, rotas, clima e envios são simulados.':'Consulte o clima perto da data e revise a proposta antes de enviar.'}</div></aside></div><section class="quick-links"><h2>Cuide dos preparativos</h2><div>${(['clients','menu_items','event_staff','quotes'] as Entity[]).filter(e=>this.canRead(e)).map(e=>`<button data-quick="${e}">${icon(navIcons[e]||'calendar')}<span><strong>${h(definition(e).label)}</strong><small>${e==='quotes'?'Valores e propostas':e==='event_staff'?'Pessoas e horários':e==='clients'?'Relacionamentos que ficam':'Sabores para cada ocasião'}</small></span>${icon('arrow')}</button>`).join('')}</div></section>`;
    this.content().querySelector('#all-events')?.addEventListener('click',()=>void this.act(()=>this.navigate('events')));
    this.content().querySelector('#new-event')?.addEventListener('click',()=>void this.act(()=>this.edit('events')));
    this.content().querySelectorAll<HTMLButtonElement>('[data-quick]').forEach(b=>b.addEventListener('click',()=>void this.act(()=>this.navigate(b.dataset.quick as Entity))));
    this.content().querySelectorAll<HTMLButtonElement>('[data-event]').forEach(b=>b.addEventListener('click',()=>void this.act(()=>this.eventDetail(events.find(e=>e.id===Number(b.dataset.event))!))));
  }
  private modal(title:string,body:string,footer='<button type="button" class="btn btn-secondary" data-close>Fechar</button>'):void {
    this.editor.innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${h(title)}</h2><button type="button" class="icon-button" data-close aria-label="Fechar janela">×</button></div><div class="dialog-body">${body}</div><div class="dialog-footer">${footer}</div>`;
    this.editor.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>this.editor.close()));
    if(!this.editor.open)this.editor.showModal();
  }
  private field(field:Field,value:unknown,old?:Row):string {
    const id=`field-${field.key}`,required=field.required||field.key==='password'&&!old;
    let control='';
    const common=`id="${id}" name="${field.key}" ${required?'required':''} ${field.min!==undefined?`min="${field.min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''}`;
    if(field.type==='select') {
      const options=field.ref?(this.refs[field.ref]||[]).map(r=>({value:String(r.id),text:String(r.name||`#${r.id}`)})):field.options!.map(v=>({value:v,text:label(v)}));
      if(field.ref&&value&&!options.some(o=>o.value===String(value)))options.push({value:String(value),text:`#${value}`});
      control=`<select class="form-select" ${common}><option value="">Selecione…</option>${options.map(o=>`<option value="${h(o.value)}" ${String(value)===o.value?'selected':''}>${h(o.text)}</option>`).join('')}</select>`;
    } else if(field.type==='textarea')control=`<textarea class="form-control" ${common} maxlength="2000" rows="3">${h(value)}</textarea>`;
    else control=`<input class="form-control" ${common} type="${field.type==='money'?'number':field.type}" value="${h(field.type==='datetime-local'?String(value||'').replace(' ','T').slice(0,16):value)}" ${field.type==='password'?'minlength="8" maxlength="128" autocomplete="new-password"':field.type==='text'||field.type==='email'?'maxlength="200"':''} ${field.step?`step="${field.step}"`:field.type==='number'?'step="1"':''}>`;
    return `<div class="field ${field.type==='textarea'?'wide':''}"><label for="${id}">${h(field.label)}${required?' <span aria-hidden="true">*</span>':''}</label>${control}${field.hint?`<small>${h(field.hint)}</small>`:''}</div>`;
  }
  private async edit(entity:Entity,old?:Row,prefill:Input={}):Promise<void> {
    const fields=definition(entity).fields;
    for(const ref of new Set(fields.flatMap(f=>f.ref&&this.canRead(f.ref)?[f.ref]:[])))this.refs[ref]=unwrap(await api[ref].list());
    const data:Input={...prefill,...old};
    if(!old){for(const field of fields)if(data[field.key]===undefined){data[field.key]=field.options?.[0]??(field.type==='money'?0:field.type==='number'&&field.required?(field.min??0):'');}if(this.scope)data[this.scope.key]=this.scope.id;}
    if(entity==='quotes'&&!old)data.valid_until=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(entity==='users')data.password='';
    const tools=entity==='events'?`<section class="form-tools"><h3>Encontre o endereço</h3><p>Preencha o CEP e consulte o endereço. Revise antes de salvar.</p><div class="actions"><button type="button" class="btn btn-secondary btn-sm" id="cep">Consultar CEP</button><button type="button" class="btn btn-secondary btn-sm" id="geocode">Localizar coordenadas</button></div><div id="location-results"></div></section>`:entity==='quotes'?'<section class="form-tools"><h3>Distância para o frete</h3><p>A saída é a sede do buffet. Selecione um evento para consultar o trajeto.</p><button type="button" id="route" class="btn btn-secondary">Consultar distância</button><div id="route-result"></div></section>':'';
    this.modal(`${old?'Editar':'Cadastrar'} ${definition(entity).singular}`,`<form id="entity-form"><p class="form-note">Campos com * são obrigatórios.${entity==='quotes'?' O total é calculado ao salvar, incluindo itens, equipe e fornecedores.':''}</p>${old&&entity==='quotes'?`<div class="quote-total"><span>Total da versão ${old.version}</span><strong>${money(old.total)}</strong></div>`:''}<div class="form-grid">${fields.map(f=>this.field(f,data[f.key],old)).join('')}</div>${tools}<div class="form-error" role="alert" hidden></div></form>`,`<button type="button" class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" type="submit" form="entity-form">Salvar cadastro</button>`);
    const form=this.editor.querySelector<HTMLFormElement>('form')!;
    const get=(key:string)=>(form.elements.namedItem(key) as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement).value;
    const set=(key:string,value:unknown)=>{(form.elements.namedItem(key) as HTMLInputElement).value=String(value??'');};
    const errorBox=form.querySelector<HTMLElement>('.form-error')!;
    form.addEventListener('submit',event=>{event.preventDefault();void this.act(async()=>{
      const input=Object.fromEntries(new FormData(form));
      unwrap(await api[entity].save(input,old?.id));this.editor.close();this.toast('Cadastro salvo.');await this.navigate(entity,this.view===entity?this.scope:undefined);
    },this.editor.querySelector<HTMLButtonElement>('[type="submit"]')!,errorBox);});
    const wire=(selector:string,work:()=>Promise<void>)=>this.editor.querySelector<HTMLButtonElement>(selector)?.addEventListener('click',event=>void this.act(work,event.currentTarget as HTMLButtonElement,errorBox));
    wire('#cep',async()=>{
      const result=unwrap(await api.cep(get('postal_code')));for(const key of ['street','district','city','state'])set(key,result[key]);
      this.editor.querySelector('#location-results')!.innerHTML=`<p class="api-source">${h(result.source)}. Revise o endereço e complete o número.</p>`;
    });
    wire('#geocode',async()=>{
      const result=unwrap(await api.geocode(['street','number','district','city','state','postal_code'].map(get).filter(Boolean).join(', ')));
      const candidates=result.candidates as {label:string;coordinates:[number,number]}[];
      const box=this.editor.querySelector('#location-results')!;box.innerHTML=`<p class="api-source">${h(result.source)}. Selecione o local correto:</p>${candidates.map((c,i)=>`<button type="button" class="candidate" data-candidate="${i}">${h(c.label)}<small>${c.coordinates[1]}, ${c.coordinates[0]}</small></button>`).join('')}`;
      box.querySelectorAll<HTMLButtonElement>('[data-candidate]').forEach(b=>b.addEventListener('click',()=>{const c=candidates[Number(b.dataset.candidate)];set('longitude',c.coordinates[0]);set('latitude',c.coordinates[1]);box.textContent='Coordenadas preenchidas. Revise o local antes de salvar.';}));
    });
    wire('#route',async()=>{
      const event=this.refs.events?.find(e=>e.id===Number(get('event_id')));
      if(!event) throw new Error('Selecione um evento para consultar a distância.');
      const result=unwrap(await api.route({eventId:event.id}));
      const box=form.querySelector('#route-result')!;
      if(result.exempt) {
        set('distance_km',0);
        set('distance_source','manual');
        box.textContent=String(result.message);
        return;
      }
      set('distance_km',Number(result.km).toFixed(3));
      set('trips',2);
      set('distance_source',result.demo?'manual':'openrouteservice');
      box.textContent=`${result.source}: ${Number(result.km).toLocaleString('pt-BR',{maximumFractionDigits:3})} km e aproximadamente ${Math.round(Number(result.minutes))} min por trecho. O frete considera ida e volta.`;
    });
    if(entity==='event_items')form.querySelector('[name="item_id"]')?.addEventListener('change',()=>{const item=this.refs.menu_items?.find(i=>i.id===Number(get('item_id')));if(item)set('unit_price',item.price);});
    if(entity==='event_staff'){
      const fill=()=>{const e=this.refs.events?.find(r=>r.id===Number(get('event_id')));if(e){set('starts_at',String(e.setup_at).replace(' ','T').slice(0,16));set('ends_at',String(e.teardown_at).replace(' ','T').slice(0,16));}};
      form.querySelector('[name="event_id"]')?.addEventListener('change',fill);if(!old&&get('event_id'))fill();
    }
  }
  private deleteDialog(entity:Entity,row:Row):void {
    this.confirm.innerHTML=`<div class="dialog-header"><h2 id="confirm-title">Excluir ${h(definition(entity).singular)}?</h2></div><div class="dialog-body"><p>Excluir ${h(row.name||`o registro #${row.id}`)}? Esta ação não pode ser desfeita. Registros com vínculos ou histórico protegido serão preservados.</p><div class="form-error" role="alert" hidden></div></div><div class="dialog-footer"><button class="btn btn-secondary" id="cancel-delete">Cancelar</button><button class="btn btn-danger" id="delete">Excluir registro</button></div>`;
    this.confirm.querySelector('#cancel-delete')!.addEventListener('click',()=>this.confirm.close());
    const button=this.confirm.querySelector<HTMLButtonElement>('#delete')!;
    button.addEventListener('click',()=>void this.act(async()=>{unwrap(await api[entity].remove(row.id));this.confirm.close();this.toast('Registro excluído.');await this.navigate(entity,this.scope);},button,this.confirm.querySelector<HTMLElement>('.form-error')!));
    this.confirm.showModal();
  }
  private async eventDetail(event:Row):Promise<void> {
    const names=(['event_items','event_suppliers','event_staff','quotes'] as Entity[]).filter(e=>this.canRead(e));
    const related=await Promise.all(names.map(async e=>({entity:e,rows:unwrap(await api[e].list()).filter(r=>Number(r.event_id)===event.id)})));
    this.modal(String(event.name),`<div class="detail-heading">${badge(event.status)}<span>${h(label(event.type))} • ${event.guests} convidados</span></div><dl class="detail-grid"><div><dt>Data do evento</dt><dd>${dateTime(event.starts_at)}</dd></div><div><dt>Local</dt><dd>${h(event.venue)} • ${label(event.outdoors)}</dd></div><div><dt>Endereço</dt><dd>${h(event.street)}, ${h(event.number)}<br>${h(event.city)} / ${h(event.state)} • ${h(event.postal_code)}</dd></div><div><dt>Operação</dt><dd>Montagem: ${dateTime(event.setup_at)}<br>Desmontagem: ${dateTime(event.teardown_at)}</dd></div></dl><div class="event-links">${related.map(r=>`<button data-related="${r.entity}"><strong>${r.rows.length}</strong><span>${h(definition(r.entity).label)}</span>${icon('arrow')}</button>`).join('')}</div><section class="weather-panel"><div><h3>${icon('sun')} Previsão para o encontro</h3><p>A previsão fica disponível perto da data. Use-a para planejar eventos ao ar livre.</p></div><button class="btn btn-secondary" id="weather">Consultar previsão</button><div id="weather-result" role="status"></div></section>${event.notes?`<h3>Observações</h3><p class="preserve-lines">${h(event.notes)}</p>`:''}`);
    this.editor.querySelectorAll<HTMLButtonElement>('[data-related]').forEach(b=>b.addEventListener('click',()=>void this.act(async()=>{this.editor.close();await this.navigate(b.dataset.related as Entity,{key:'event_id',id:event.id,name:String(event.name)});})));
    const button=this.editor.querySelector<HTMLButtonElement>('#weather')!;
    const output=this.editor.querySelector<HTMLElement>('#weather-result')!;
    const load=async()=>{
      output.textContent='Consultando previsão…';
      const result=await api.weather(event.id);
      if(!result.ok) {
        output.textContent=result.error;
        return;
      }
      const r=result.data;
      output.innerHTML=r.available
        ?`<div class="weather-values"><strong>${h(r.min)} °C – ${h(r.max)} °C</strong><span>Probabilidade de chuva: ${h(r.rainProbability)}%<br>Precipitação: ${h(r.precipitation)} mm</span></div>
          ${r.rainAlert?'<p role="alert"><strong>Atenção, equipe:</strong> probabilidade de chuva acima de 50% para este evento ao ar livre.</p>':''}
          <p class="api-source">${h(r.source)} · Previsão para ${h(String(r.date).split('-').reverse().join('/'))}</p>`
        :`<p>${h(r.message)}</p>`;
    };
    button.addEventListener('click',()=>void this.act(load,button));
    void this.act(load,button);
  }
  private quoteDetail(quote:Row):void {
    const snapshot=JSON.parse(String(quote.snapshot)) as {event:Row;client:Row;items:Row[];suppliers:Row[];staff:Row[]};
    this.modal(`Proposta • versão ${quote.version}`,`<div class="detail-heading">${badge(quote.status)}<span>Válida até ${dateTime(quote.valid_until)}</span></div><h3>${h(snapshot.event.name)}</h3><p>Para ${h(snapshot.client.name)} • ${h(snapshot.client.email)}<br>${dateTime(snapshot.event.starts_at)} • ${h(snapshot.event.venue)}</p><table class="data-table quote-lines"><thead><tr><th>Item</th><th>Quantidade</th><th>Preço unitário</th></tr></thead><tbody>${snapshot.items.map(item=>`<tr><td>${h(item.name)}</td><td>${h(item.quantity)} ${h(label(item.unit))}</td><td>${money(item.unit_price)}</td></tr>`).join('')}</tbody></table><dl class="totals"><div><dt>Pacote, equipe e fornecedores</dt><dd>${money(quote.subtotal)}</dd></div><div><dt>Frete estimado</dt><dd>${money(quote.freight)}</dd></div><div><dt>Outros serviços</dt><dd>${money(quote.extra)}</dd></div><div><dt>Desconto</dt><dd>${money(quote.discount)}</dd></div><div class="total"><dt>Total</dt><dd>${money(quote.total)}</dd></div></dl><p class="preserve-lines">${h(quote.notes||'Condições a combinar com o cliente.')}</p><p class="form-note">Esta proposta usa os dados preservados no momento de sua geração.</p>`,`<button class="btn btn-secondary" data-close>Fechar</button><button class="btn btn-secondary" id="confirm-preview">Prévia da confirmação</button><button class="btn btn-primary" id="email-preview">Prévia do orçamento</button>`);
    this.editor.querySelector('#email-preview')!.addEventListener('click',()=>void this.act(()=>this.email(quote,'orcamento')));
    this.editor.querySelector('#confirm-preview')!.addEventListener('click',()=>void this.act(()=>this.email(quote,'confirmacao')));
  }
  private async email(quote:Row,kind:'orcamento'|'confirmacao'):Promise<void> {
    const preview=unwrap(await api.emailPreview({quoteId:quote.id,kind}));
    this.modal('Revise a mensagem antes de enviar',`<dl class="mail-head"><dt>Destinatário</dt><dd>${h(preview.to)}</dd><dt>Assunto</dt><dd>${h(preview.subject)}</dd></dl><pre class="email-body">${h(preview.text)}</pre><p class="form-note">${preview.demo?'Demonstração: o envio será apenas registrado como simulado.':'Ao confirmar, esta mensagem será enviada ao endereço acima. Confira os dados do cliente.'}</p><div class="form-error" role="alert" hidden></div>`,`<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="send-email">${preview.demo?'Simular envio':'Confirmar envio'}</button>`);
    this.editor.querySelector<HTMLButtonElement>('#send-email')!.addEventListener('click',event=>void this.act(async()=>{const result=unwrap(await api.emailSend(preview.token));this.editor.close();this.toast(String(result.message));await this.navigate('history');},event.currentTarget as HTMLButtonElement,this.editor.querySelector<HTMLElement>('.form-error')!));
  }
  private async history(version:number):Promise<void> {
    const rows=unwrap(await api.emailHistory());if(version!==this.version)return;
    this.content().innerHTML=`<div class="page-heading"><div><h1>Histórico de e-mails</h1><p>Últimas 200 tentativas. Aceite do provedor não comprova entrega ou leitura.</p></div></div><section class="table-panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Orçamento</th><th>Mensagem</th><th>Situação</th><th>Data da tentativa</th></tr></thead><tbody>${rows.map(r=>`<tr><td>#${r.quote_id}</td><td>${h(label(r.kind))}</td><td>${badge(r.status)}</td><td>${h(new Date(String(r.attempted_at)).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}</td></tr>`).join('')}</tbody></table></div>${!rows.length?'<div class="empty-state"><h2>Nenhum envio por aqui</h2><p>Abra uma proposta e revise a mensagem para enviar um orçamento.</p></div>':''}</section>`;
  }
}

void new BuffetApp().start().catch(()=>{
  document.querySelector('#app')!.innerHTML='<div class="startup-error"><h1>Não foi possível abrir o ateliê</h1><p>Reabra o aplicativo. Para executar a demonstração, use npm run demo.</p></div>';
});

