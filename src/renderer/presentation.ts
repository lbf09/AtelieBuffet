import {definition, type Entity, type Field, type Row} from '../shared/models';
import {badge, dateTime, escapeHtml as h, icon, label, money} from './format';
import {presentationChapters, presentationPhases, presentationSamples, type PresentationChapter} from './presentation-data';

/** A self-contained tour: no IPC, database access, credentials or provider calls. */
export class Presentation {
  private dialog=document.createElement('dialog');
  private chapters:PresentationChapter[];
  private selected:Set<string>;
  private samples=presentationSamples();
  private current=0;
  private phase=0;
  private elapsed=0;
  private duration=6000;
  private playing=true;
  private finished=false;
  private timer=0;
  private lastTick=0;
  private filled=0;
  private returnFocus:HTMLElement|null=null;
  private visibility=()=>{if(document.hidden&&this.dialog.open)this.pause();};

  constructor(canRead:(entity:Entity)=>boolean) {
    this.chapters=presentationChapters(canRead);
    this.selected=new Set(this.chapters.map(chapter=>chapter.id));
  }

  open():void {
    if(this.dialog.open)return;
    this.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    this.dialog.className='presentation-dialog';
    this.dialog.setAttribute('aria-labelledby','presentation-title');
    this.dialog.innerHTML=`<div class="presentation-layout">
      <header class="presentation-header"><div>${icon('presentation')}<div><h2 id="presentation-title">Modo apresentação</h2><p>Conheça o Ateliê Buffet, passo a passo.</p></div></div><button class="btn btn-secondary btn-sm" data-tour="close">Sair da apresentação <span aria-hidden="true">×</span></button></header>
      <aside class="presentation-sidebar" aria-label="Painel de funcionalidades"><div class="presentation-selection"><h3>O que vamos mostrar?</h3><p>Marque o roteiro ou clique em uma função para ir direto.</p><div><button class="text-button" data-tour="all">Selecionar todas</button><button class="text-button" data-tour="none">Limpar seleção</button></div><span id="presentation-count"></span></div><nav class="presentation-chapters" aria-label="Funcionalidades da apresentação">${this.chapters.map((chapter,index)=>`<div class="presentation-chapter"><input type="checkbox" id="tour-select-${chapter.id}" data-select="${chapter.id}" checked aria-label="Incluir ${h(chapter.title)} no roteiro"><button type="button" data-chapter="${index}"><span>${h(chapter.title)}</span><small>${h(chapter.group)}</small></button></div>`).join('')}</nav></aside>
      <section class="presentation-main" aria-label="Demonstração"><div class="presentation-safety">${icon('check')} Dados fictícios • Nada é salvo e nenhum e-mail é enviado.</div><div class="presentation-narration" aria-live="polite" aria-atomic="true"><span id="presentation-position"></span><h3 id="presentation-caption"></h3><p id="presentation-description"></p></div><div id="presentation-stage" class="presentation-stage"></div></section>
      <footer class="presentation-controls"><div class="presentation-progress"><progress id="presentation-progress" max="100" value="0" aria-label="Progresso do roteiro"></progress><span id="presentation-status" role="status"></span></div><div class="presentation-playback"><button class="btn btn-secondary btn-sm" data-tour="restart" title="Recomeçar o roteiro selecionado">Reiniciar</button><div class="presentation-transport"><button class="btn btn-secondary btn-sm" data-tour="previous" aria-label="Etapa anterior">← Anterior</button><button class="btn btn-primary btn-sm" data-tour="play">Pausar</button><button class="btn btn-secondary btn-sm" data-tour="next" aria-label="Próxima etapa">Próxima →</button></div><label class="presentation-speed">Ritmo <select id="presentation-speed" class="form-select" aria-label="Ritmo da apresentação"><option value="10000">Tranquilo · 10 s</option><option value="6000" selected>Normal · 6 s</option><option value="3000">Rápido · 3 s</option></select></label></div></footer>
    </div>`;
    document.body.append(this.dialog);
    this.dialog.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('button'):null;
      if(!target)return;
      if(target.dataset.chapter!==undefined){this.current=Number(target.dataset.chapter);this.selected.add(this.chapter.id);this.finished=false;this.phase=0;this.render();return;}
      switch(target.dataset.tour){
        case 'close':this.close();break;
        case 'play':if(this.playing)this.pause();else {if(this.finished)this.restart();else {this.playing=true;this.lastTick=performance.now();this.updateControls();}}break;
        case 'previous':this.move(-1);break;
        case 'next':this.move(1);break;
        case 'restart':this.restart();break;
        case 'all':this.chapters.forEach(c=>this.selected.add(c.id));this.finished=false;this.render();break;
        case 'none':this.selected.clear();this.playing=false;this.render();break;
      }
    });
    this.dialog.addEventListener('change',event=>{
      const input=event.target as HTMLInputElement;
      if(input.dataset.select){
        if(input.checked)this.selected.add(input.dataset.select);else this.selected.delete(input.dataset.select);
        if(!this.selected.has(this.chapter.id)){this.current=Math.max(0,this.chapters.findIndex(c=>this.selected.has(c.id)));this.phase=0;}
        if(!this.selected.size)this.playing=false;
        this.finished=false;this.render();
      }
      if(input.id==='presentation-speed'){this.duration=Number(input.value);this.elapsed=0;this.lastTick=performance.now();}
    });
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.dialog.addEventListener('close',()=>this.dispose(),{once:true});
    document.addEventListener('visibilitychange',this.visibility);
    this.dialog.showModal();
    this.render();
    this.timer=window.setInterval(()=>this.tick(),100);
    this.dialog.querySelector<HTMLButtonElement>('[data-tour="play"]')!.focus();
  }

  private get chapter():PresentationChapter {return this.chapters[this.current];}
  private get route():number[] {return this.chapters.flatMap((chapter,index)=>this.selected.has(chapter.id)?[index]:[]);}
  private query<T extends HTMLElement>(selector:string):T {return this.dialog.querySelector<T>(selector)!;}
  private pause():void {this.playing=false;this.updateControls();}
  private close():void {this.dialog.close();}
  private dispose():void {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange',this.visibility);
    this.dialog.remove();this.returnFocus?.focus();
  }
  private restart():void {
    if(!this.selected.size)return;
    this.current=this.route[0];this.phase=0;this.finished=false;this.playing=true;this.render();
  }
  private move(direction:1|-1):void {
    const route=this.route;if(!route.length)return;
    const position=route.indexOf(this.current)*4+this.phase+direction;
    if(position<0)return;
    if(position>=route.length*4){this.finished=true;this.playing=false;this.updateControls();return;}
    this.finished=false;this.current=route[Math.floor(position/4)];this.phase=position%4;this.render();
  }
  private tick():void {
    const now=performance.now(),delta=now-this.lastTick;this.lastTick=now;
    if(!this.playing||!this.selected.size||document.hidden)return;
    this.elapsed+=Math.min(delta,250);
    this.fillForm();
    this.updateProgress();
    if(this.elapsed>=this.duration)this.move(1);
  }
  private updateProgress():void {
    const route=this.route,position=route.indexOf(this.current)*4+this.phase;
    this.query<HTMLProgressElement>('#presentation-progress').value=this.finished?100:route.length?(position+Math.min(1,this.elapsed/this.duration))/(route.length*4)*100:0;
  }
  private updateControls():void {
    const route=this.route,has=route.length>0;
    this.query<HTMLButtonElement>('[data-tour="play"]').textContent=this.finished?'Reproduzir novamente':this.playing?'Pausar':'Continuar';
    this.query<HTMLButtonElement>('[data-tour="play"]').disabled=!has;
    this.query<HTMLButtonElement>('[data-tour="previous"]').disabled=!has||(route[0]===this.current&&this.phase===0);
    this.query<HTMLButtonElement>('[data-tour="next"]').disabled=!has||this.finished;
    this.query<HTMLButtonElement>('[data-tour="restart"]').disabled=!has;
    this.query('#presentation-status').textContent=!has?'Selecione uma funcionalidade para começar.':this.finished?'Apresentação concluída. Você pode reiniciar ou escolher outra função.':`${this.playing?'Reproduzindo':'Pausado'} · Etapa ${route.indexOf(this.current)*4+this.phase+1} de ${route.length*4}`;
    this.updateProgress();
  }
  private render():void {
    this.elapsed=0;this.filled=0;this.lastTick=performance.now();
    this.query('#presentation-count').textContent=`${this.selected.size} de ${this.chapters.length} funcionalidades selecionadas`;
    this.dialog.querySelectorAll<HTMLInputElement>('[data-select]').forEach(input=>input.checked=this.selected.has(input.dataset.select!));
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach(button=>{
      const active=Number(button.dataset.chapter)===this.current&&this.selected.size>0;
      button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    });
    const stage=this.query('#presentation-stage');stage.scrollTop=0;
    if(!this.selected.size){
      this.query('#presentation-position').textContent='Seu roteiro';this.query('#presentation-caption').textContent='Escolha o que apresentar';
      this.query('#presentation-description').textContent='Use as caixas de seleção do painel. Para mostrar apenas uma função, limpe a seleção e clique nela.';
      stage.innerHTML='<div class="empty-state"><h3>Uma apresentação do seu jeito</h3><p>Selecione clientes, eventos, financeiro ou qualquer outra funcionalidade.</p></div>';
    } else {
      const chapter=this.chapter;
      this.query('#presentation-position').textContent=`Função ${this.route.indexOf(this.current)+1} de ${this.selected.size} · ${chapter.group}`;
      this.query('#presentation-caption').textContent=chapter.title;
      this.query('#presentation-description').textContent=chapter.description;
      stage.innerHTML=chapter.entity?this.entityScene(chapter.entity):this.featureScene(chapter.id);
      if(chapter.entity&&this.phase===2&&!this.playing){this.elapsed=this.duration*.75;this.fillForm();}
      // The stage is a narrated preview. Only the surrounding player controls act on the app.
      stage.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.tabIndex=-1;button.setAttribute('aria-disabled','true');});
    }
    this.updateControls();
  }

  private display(entity:Entity,key:string,row:Row):string {
    const field=definition(entity).fields.find(f=>f.key===key),value=row[key];
    if(field?.ref){const ref=this.samples[field.ref];return String(ref.name||ref.label||ref.service);}
    if(field?.type==='money'||['total','margin_amount'].includes(key))return money(value);
    if(field?.type==='date'||field?.type==='datetime-local')return dateTime(value);
    return label(value);
  }
  private entityScene(entity:Entity):string {
    const config=definition(entity),row=this.samples[entity];
    const caption=[`Localize registros pela busca e consulte as ações de cada linha.`,`“Novo cadastro” abre os campos de ${config.singular}.`,`O preenchimento acontece automaticamente com um exemplo fictício.`,`Cadastro demonstrado. No app, “Salvar cadastro” registra os dados; “Editar” e “Excluir” ficam na lista.`][this.phase];
    const banner=`<div class="presentation-step"><span>${this.phase+1} / 4</span><div><strong>${presentationPhases[this.phase]}</strong><p>${h(caption)}</p></div></div>`;
    if(this.phase===1||this.phase===2){
      return `${banner}<section class="presentation-form"><div class="dialog-header"><h3>Cadastrar ${h(config.singular)}</h3><span class="pill">Exemplo automático</span></div><div class="dialog-body"><p class="form-note">Campos com * são obrigatórios.</p><div class="form-grid">${config.fields.filter(f=>!f.hidden).map(field=>this.field(field)).join('')}</div></div><div class="dialog-footer"><span class="btn btn-secondary">Cancelar</span><span class="btn btn-primary ${this.phase===2?'presentation-highlight':''}">Salvar cadastro</span></div></section>`;
    }
    const columns=config.columns;
    return `${banner}${this.phase===3?'<div class="presentation-success">'+icon('check')+' Exemplo preenchido. Seus cadastros reais permanecem intactos.</div>':''}<div class="page-heading"><div><h3>${h(config.label)}</h3><p>${h(this.chapter.description)}</p></div><span class="btn btn-primary ${this.phase===0?'presentation-highlight':''}">${icon('plus')} Novo cadastro</span></div><section class="table-panel"><div class="table-toolbar"><div class="search-box">${icon('search')}<span>Buscar em ${h(config.label.toLocaleLowerCase('pt-BR'))}</span></div><span>1 registro fictício</span></div><div class="table-scroll"><table class="data-table"><thead><tr>${columns.map(key=>`<th>${h(config.fields.find(f=>f.key===key)?.label||({total:'Total',version:'Versão',margin_amount:'Margem'}[key]||key))}</th>`).join('')}<th>Ações</th></tr></thead><tbody><tr>${columns.map(key=>`<td>${key==='status'?badge(row[key]):h(this.display(entity,key,row))}</td>`).join('')}<td><div class="row-actions"><span class="text-button">Editar</span><span class="text-button danger">Excluir</span></div></td></tr></tbody></table></div></section>`;
  }
  private field(field:Field):string {
    const id=`tour-field-${field.key}`,required=field.required||field.type==='password';
    const common=`id="${id}" data-field="${field.key}" tabindex="-1"`;
    let control:string;
    if(field.type==='select'){
      const options=field.ref?[{value:'1',text:String(this.samples[field.ref].name||this.samples[field.ref].label)}]:(field.options||[]).map(value=>({value,text:label(value)}));
      control=`<select class="form-select" ${common} disabled><option value="">Selecione…</option>${options.map(option=>`<option value="${h(option.value)}">${h(option.text)}</option>`).join('')}</select>`;
    }else if(field.type==='textarea')control=`<textarea class="form-control" ${common} readonly rows="2"></textarea>`;
    else control=`<input class="form-control" ${common} type="${field.type==='money'?'number':field.type}" readonly>`;
    return `<div class="field ${field.type==='textarea'?'wide':''}"><label for="${id}">${h(field.label)}${required?' *':''}</label>${control}${field.hint?`<small>${h(field.hint)}</small>`:''}</div>`;
  }
  private fillForm():void {
    if(!this.chapter.entity||this.phase!==2)return;
    const fields=[...this.dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-field]')];
    const count=Math.max(this.filled,Math.min(fields.length,Math.floor(this.elapsed/(this.duration*.75)*fields.length)));
    for(let index=this.filled;index<count;index++){
      const field=fields[index];field.value=String(this.samples[this.chapter.entity][field.dataset.field!]??'');
      this.dialog.querySelector('.presentation-filling')?.classList.remove('presentation-filling');field.closest('.field')?.classList.add('presentation-filling');
      const stage=this.query('#presentation-stage'),rect=field.getBoundingClientRect(),bounds=stage.getBoundingClientRect();
      if(rect.bottom>bounds.bottom-40||rect.top<bounds.top)stage.scrollTop+=rect.top-bounds.top-80;
    }
    this.filled=count;
  }

  private featureScene(id:string):string {
    const scene=this.scenes(id)[this.phase];
    return `<div class="presentation-step"><span>${this.phase+1} / 4</span><div><strong>${h(scene.title)}</strong><p>${h(scene.description)}</p></div></div>${scene.body}`;
  }
  private scenes(id:string):{title:string;description:string;body:string}[] {
    const table=(headers:string[],rows:string[][])=>`<section class="table-panel"><div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(c=>`<th>${h(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    const card=(title:string,body:string)=>`<section class="presentation-feature"><h3>${h(title)}</h3>${body}</section>`;
    const totals=(rows:[string,string][])=>`<dl class="totals">${rows.map(([key,value],index)=>`<div${index===rows.length-1?' class="total"':''}><dt>${h(key)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>`;
    const event=this.samples.events;
    switch(id){
      case 'dashboard':return [
        {title:'Tudo começa na agenda',description:'O painel reúne eventos em planejamento, convidados e propostas aprovadas.',body:`<h3>Agenda do buffet</h3><section class="overview-strip"><div><span>Eventos em planejamento</span><strong>3</strong><small>Encontros para preparar</small></div><div><span>Convidados esperados</span><strong>180</strong><small>Nos eventos em aberto</small></div><div><span>Propostas aprovadas</span><strong>${money(7407.35)}</strong><small>Exemplo de orçamento</small></div></section>`},
        {title:'Veja o próximo encontro',description:'Abra um evento da agenda para consultar seus detalhes e vínculos.',body:card(String(event.name),`<div class="detail-heading">${badge('rascunho')}<span>Aniversário · 60 convidados</span></div><dl class="detail-grid"><div><dt>Data do evento</dt><dd>${dateTime(event.starts_at)}</dd></div><div><dt>Local</dt><dd>Casa do Jardim · Ao ar livre</dd></div></dl>`)},
        {title:'Prepare cada detalhe',description:'Os cadastros se conectam: cliente, evento, cardápio, parceiros e equipe.',body:card('Do primeiro contato à recepção','<ol class="presentation-checklist"><li>Cadastre o cliente e o evento.</li><li>Escolha o cardápio e as quantidades.</li><li>Vincule fornecedores e organize as escalas.</li><li>Revise o orçamento e acompanhe o sinal.</li></ol>')},
        {title:'Escolha seu roteiro',description:'A apresentação seguirá automaticamente. Use o painel para mostrar somente as funções desejadas.',body:card('Você controla a apresentação','<p>Pause para explicar um detalhe, avance uma etapa ou clique diretamente em uma funcionalidade. O ritmo pode ser ajustado a qualquer momento.</p><p class="presentation-success">Todos os exemplos são fictícios e independentes do banco de dados.</p>')}
      ];
      case 'integrations':return [
        {title:'Consulte o endereço pelo CEP',description:'No cadastro de evento, o botão “Consultar CEP” preenche o endereço para revisão.',body:card('Encontre o endereço',table(['CEP de exemplo','Logradouro','Cidade / UF'],[['13010-111','Praça de demonstração','Campinas / SP']])+'<p class="api-source">Consulta ilustrativa. Complete o número e revise o endereço antes de salvar.</p>')},
        {title:'Localize as coordenadas',description:'“Localizar coordenadas” apresenta candidatos. Selecione o local correto.',body:card('Confirme o local','<div class="candidate presentation-highlight">Casa do Jardim · Campinas / SP<small>Latitude: -22.9056 · Longitude: -47.0608</small></div><p class="api-source">Resultado fictício de geocodificação.</p>')},
        {title:'Calcule o frete da proposta',description:'“Consultar distância” traz o trajeto. A tarifa e os percursos compõem o frete; Limeira (SP) tem isenção.',body:card('Distância para o frete',totals([['Distância de exemplo','30 km'],['Tarifa por km',money(2.5)],['Percursos','2 (ida e volta)'],['Frete',money(150)]]))},
        {title:'Planeje eventos ao ar livre',description:'Nos detalhes do evento, consulte o clima perto da data e prepare uma alternativa em caso de chuva.',body:`<section class="weather-panel"><h3>${icon('sun')} Previsão para o encontro</h3><div class="weather-values"><strong>21 °C – 28 °C</strong><span>Probabilidade de chuva: 65%<br>Precipitação: 8 mm</span></div><p><strong>Atenção, equipe:</strong> probabilidade de chuva acima de 50% para este evento ao ar livre.</p><p class="api-source">Previsão fictícia para apresentação.</p></section>`}
      ];
      case 'proposal':return [
        {title:'Revise o pacote do cardápio',description:'A faixa considera 60 convidados: 55 adultos e 5 crianças de 6 a 10 anos, pagando 50%.',body:card('Pacote do cardápio',totals([['55 adultos × R$ 95,00',money(5225)],['5 crianças × R$ 47,50',money(237.5)],['Pacote',money(5462.5)]]))},
        {title:'Entenda o total da proposta',description:'Itens, fornecedores, equipe e frete compõem a receita. O imposto é somado ao total do cliente.',body:card('Celebração da Marina · versão 1',totals([['Pacote do cardápio',money(5462.5)],['Itens avulsos',money(130)],['Fornecedores',money(800)],['Equipe',money(450)],['Frete',money(150)],['Impostos (6%)',money(419.85)],['Total',money(7407.35)]]))},
        {title:'Acompanhe versões e alterações',description:'“Nova versão” abre uma proposta em rascunho. Edições em propostas enviadas ou aprovadas registram o antes e o depois.',body:table(['Versão','Situação','Total'],[['1','Enviado',money(7407.35)],['2','Rascunho',money(7407.35)]])},
        {title:'Exporte o relatório',description:'Em Orçamentos, “Exportar relatório” permite salvar os dados. Aqui mostramos apenas uma prévia, sem gerar arquivo.',body:card('Prévia do relatório',table(['Evento','Versão','Total','Situação'],[['Celebração da Marina','1',money(7407.35),'Aprovado']]))}
      ];
      case 'payments':return [
        {title:'Aprove a proposta e acompanhe o sinal',description:'A aprovação gera o sinal. Para confirmar o evento, registre seu pagamento.',body:card('Sinal de 30%',totals([['Total aprovado',money(7407.35)],['Sinal necessário',money(2222.21)]]))},
        {title:'Gere as parcelas restantes',description:'Nos detalhes do evento, “Gerar parcelas” divide o restante. Pagamentos já registrados são preservados.',body:table(['Tipo','Valor','Situação'],[['Sinal',money(2222.21),'Pago'],['Parcela 1',money(1728.38),'Em aberto'],['Parcela 2',money(1728.38),'Em aberto'],['Parcela 3',money(1728.38),'Em aberto']])},
        {title:'Confirme o evento',description:'Com proposta aprovada e sinal pago, altere a situação do evento para confirmado.',body:card('Celebração da Marina',`<div class="detail-heading">${badge('confirmado')}<span>Orçamento aprovado e sinal pago</span></div><p>A equipe pode acompanhar horários, serviços e quantidades do cardápio nos vínculos do evento.</p>`)},
        {title:'Cancelamento e arquivo',description:'“Cancelar evento” mostra multa e reembolso conforme a antecedência. “Arquivar” preserva o histórico e retira o evento do painel.',body:card('Revise antes de confirmar','<ol class="presentation-checklist"><li>Confira a prévia da política de cancelamento.</li><li>Registre o motivo e revise multa e reembolso.</li><li>Confirme o cancelamento ou arquive o registro quando necessário.</li></ol><p class="form-note">Nenhum evento real será cancelado ou arquivado nesta apresentação.</p>')}
      ];
      case 'email':return [
        {title:'Abra a prévia do orçamento',description:'Em “Ver proposta”, escolha a prévia do orçamento ou a confirmação do evento.',body:card('Revise a mensagem antes de enviar','<dl class="mail-head"><dt>Destinatário</dt><dd>marina@example.com</dd><dt>Assunto</dt><dd>Proposta · Celebração da Marina</dd></dl>')},
        {title:'Confira a mensagem',description:'Revise destinatário, valores e condições. A margem interna não aparece no e-mail do cliente.',body:`<pre class="email-body">Olá, Marina!\n\nConfira a proposta para sua celebração:\n60 convidados · Essencial brasileiro\nTotal: ${money(7407.35)}\nSinal: ${money(2222.21)}\n\nAteliê Buffet\n\nMensagem fictícia de apresentação.</pre>`},
        {title:'Simule o envio',description:'Na apresentação, o envio é apenas ilustrativo. No app, revise a prévia antes de confirmar um envio real.',body:card('Simulação concluída','<p class="presentation-success">'+icon('check')+' Nenhuma mensagem foi enviada.</p>')},
        {title:'Consulte o histórico',description:'O histórico registra as tentativas. O aceite do provedor não comprova entrega ou leitura.',body:table(['Orçamento','Mensagem','Situação'],[['#1','Orçamento','Simulado']])}
      ];
      case 'technical':return [
        {title:'Consulte as migrações',description:'Administradores acompanham quais versões do banco foram aplicadas.',body:table(['Versão','Situação'],[['1','Aplicada'],['2','Aplicada'],['3','Aplicada'],['4','Aplicada']])},
        {title:'Acompanhe as tentativas de envio',description:'O painel mostra as últimas 200 tentativas, somente para consulta.',body:table(['Orçamento','Mensagem','Situação'],[['#1','Orçamento','Simulado']])},
        {title:'Entenda os perfis de acesso',description:'Os menus e as operações disponíveis respeitam o perfil da conta.',body:table(['Perfil','Responsabilidade'],[['Administrador','Cadastros, usuários e configurações'],['Atendimento','Clientes, eventos e propostas'],['Operações','Preparação, cardápios, parceiros e escalas']])},
        {title:'Retorne ao trabalho quando quiser',description:'Use “Sair da apresentação” ou Esc. A tela anterior e os registros reais continuam como estavam.',body:card('Pronto para cuidar dos detalhes','<p>Você pode reproduzir o roteiro novamente ou selecionar somente os módulos que deseja explicar à equipe.</p>')}
      ];
      default:throw new Error(`Capítulo desconhecido: ${id}`);
    }
  }
}
