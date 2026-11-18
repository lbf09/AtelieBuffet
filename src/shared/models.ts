export type Role = 'administrador' | 'atendimento' | 'operacoes';
export type Value = string | number | null;
export type Row = { id: number; [key: string]: Value };
export type Input = Record<string, unknown>;
export type FieldKind = 'text' | 'email' | 'number' | 'money' | 'date' | 'datetime-local' | 'select' | 'textarea' | 'password';
export interface Field {
  key: string; label: string; type: FieldKind; required?: boolean;
  min?: number; max?: number; options?: string[]; ref?: Entity; step?: string; hint?: string; hidden?: boolean;
}
export interface EntityDefinition { label: string; singular: string; group: string; fields: Field[]; columns: string[]; }
const f = (key: string, label: string, type: FieldKind = 'text', extra: Partial<Field> = {}): Field => ({key, label, type, required: true, ...extra});
const ref = (key: string, label: string, entity: Entity, extra: Partial<Field> = {}): Field => f(key, label, 'select', {ref: entity, ...extra});
const status = (options: string[]) => f('status', 'Situação', 'select', {options});
const money = (key: string, label: string, extra: Partial<Field> = {}) => f(key, label, 'money', {min: 0, max: 99999999.99, step: '0.01', ...extra});
export const entities = {
  clients: {label: 'Clientes', singular: 'cliente', group: 'Relacionamento', columns: ['name','email','phone'], fields: [f('name','Nome'), f('email','E-mail','email'), f('phone','Telefone'), f('notes','Observações','textarea',{required:false})]},
  events: {label: 'Eventos', singular: 'evento', group: 'Planejamento', columns: ['name','client_id','starts_at','guests','status'], fields: [
    f('name','Nome do evento'), ref('client_id','Cliente','clients'), f('type','Tipo','select',{options:['aniversario','casamento','corporativo']}),
    f('setup_at','Início da montagem','datetime-local'), f('starts_at','Início do evento','datetime-local'), f('ends_at','Fim do evento','datetime-local'), f('teardown_at','Fim da desmontagem','datetime-local'),
    f('adults','Adultos','number',{min:0,max:100000,hint:'Inclua crianças de 11 anos ou mais. As demais idades ficam em “Crianças por faixa”.'}), f('guests','Total de convidados','number',{required:false,min:1,max:100000,hidden:true,hint:'Calculado a partir de adultos e crianças.'}),
    ref('menu_id','Cardápio do evento','menus',{required:false}), f('venue','Local'), f('outdoors','Ambiente','select',{options:['fechado','aberto']}),
    f('postal_code','CEP'), f('street','Logradouro'), f('number','Número'), f('district','Bairro'), f('city','Cidade'), f('state','UF'),
    f('latitude','Latitude','number',{required:false,min:-90,max:90,step:'any'}), f('longitude','Longitude','number',{required:false,min:-180,max:180,step:'any'}),
    status(['rascunho','orcamento_enviado','confirmado','concluido','cancelado']), f('notes','Observações','textarea',{required:false})]},
  event_guests: {label:'Crianças por faixa',singular:'contagem de crianças',group:'Planejamento',columns:['event_id','child_band_id','quantity'],fields:[
    ref('event_id','Evento','events'),ref('child_band_id','Faixa de idade','child_bands'),f('quantity','Quantidade','number',{min:0,max:100000})]},
  event_menu_items: {label:'Quantidades do cardápio',singular:'quantidade do cardápio',group:'Planejamento',columns:['event_id','item_id','quantity'],fields:[
    ref('event_id','Evento','events'),ref('item_id','Item','menu_items'),f('quantity','Quantidade ajustada','number',{min:0,max:100000,step:'0.001'})]},
  event_items: {label:'Itens avulsos',singular:'item avulso',group:'Planejamento',columns:['event_id','item_id','quantity','unit_price'],fields:[ref('event_id','Evento','events'),ref('item_id','Item','menu_items'),f('quantity','Quantidade','number',{min:0.001,max:100000,step:'0.001'}),money('unit_price','Preço unitário combinado (R$)')]},
  menus: {label:'Cardápios',singular:'cardápio',group:'Catálogo',columns:['name','status'],fields:[f('name','Nome'),f('description','Descrição','textarea',{required:false}),status(['ativo','inativo'])]},
  menu_items: {label:'Itens do cardápio',singular:'item',group:'Catálogo',columns:['name','unit','price','cost','restrictions'],fields:[f('name','Nome'),f('description','Descrição','textarea',{required:false}),f('unit','Unidade','select',{options:['unidade','porcao','kg','litro','pessoa']}),money('price','Preço de venda (R$)'),money('cost','Custo unitário (R$)'),f('restrictions','Alérgenos / restrições','textarea',{required:false})]},
  menu_compositions: {label:'Composição dos cardápios',singular:'composição',group:'Catálogo',columns:['menu_id','item_id','quantity'],fields:[ref('menu_id','Cardápio','menus'),ref('item_id','Item','menu_items'),f('quantity','Quantidade por convidado','number',{min:0.001,max:100000,step:'0.001',hint:'Multiplicada pelo total de convidados ao aplicar o cardápio.'})]},
  price_bands: {label:'Faixas de preço',singular:'faixa de preço',group:'Catálogo',columns:['menu_id','min_guests','max_guests','price_per_adult'],fields:[
    ref('menu_id','Cardápio','menus'),f('min_guests','Mínimo de convidados','number',{min:1,max:100000}),f('max_guests','Máximo de convidados','number',{required:false,min:1,max:100000,hint:'Deixe em branco na última faixa.'}),money('price_per_adult','Preço por adulto (R$)'),f('min_billing_guests','Mínimo faturado (convidados)','number',{min:0,max:100000,hint:'0 desativa a cobrança mínima.'})]},
  child_bands: {label:'Faixas de idade',singular:'faixa de idade',group:'Catálogo',columns:['label','min_age','max_age','percent','status'],fields:[
    f('label','Descrição'),f('min_age','Idade mínima','number',{min:0,max:120}),f('max_age','Idade máxima','number',{min:0,max:120}),f('percent','Percentual do adulto (%)','number',{min:0,max:100,step:'0.01'}),status(['ativo','inativo'])]},
  suppliers: {label:'Fornecedores',singular:'fornecedor',group:'Operação',columns:['name','category','phone','status'],fields:[f('name','Nome'),f('category','Categoria'),f('contact','Contato'),f('phone','Telefone'),f('email','E-mail','email'),status(['ativo','inativo'])]},
  event_suppliers: {label:'Serviços contratados',singular:'serviço contratado',group:'Operação',columns:['event_id','supplier_id','service','cost','status'],fields:[ref('event_id','Evento','events'),ref('supplier_id','Fornecedor','suppliers'),f('service','Serviço'),money('cost','Valor combinado (R$)'),status(['previsto','confirmado','cancelado'])]},
  employees: {label:'Equipe',singular:'funcionário',group:'Operação',columns:['name','job','phone','status'],fields:[f('name','Nome'),f('job','Função'),f('phone','Telefone'),f('email','E-mail','email'),status(['ativo','inativo'])]},
  event_staff: {label:'Escalas',singular:'escala',group:'Operação',columns:['event_id','employee_id','job','starts_at','ends_at','cost'],fields:[ref('event_id','Evento','events'),ref('employee_id','Funcionário','employees'),f('job','Função no evento'),f('starts_at','Início da escala','datetime-local'),f('ends_at','Fim da escala','datetime-local'),money('cost','Custo combinado (R$)')]},
  quotes: {label:'Orçamentos',singular:'orçamento',group:'Financeiro',columns:['event_id','version','valid_until','total','margin_amount','status'],fields:[
    ref('event_id','Evento','events'),f('valid_until','Validade','date'),
    money('freight_base','Frete: taxa base (R$)',{required:false,hidden:true}),
    f('distance_km','Distância (km)','number',{min:0,max:100000,step:'0.001'}),money('rate_km','Tarifa por km (R$)'),
    f('trips','Percursos','select',{options:['1','2']}),f('distance_source','Origem da distância','select',{options:['manual','openrouteservice']}),
    money('extra','Outros serviços (R$)'),money('discount','Desconto (R$)'),
    f('tax_percent','Impostos (%)','number',{required:false,min:0,max:100,step:'0.01',hint:'Somado ao total do cliente. Em branco usa 6%.'}),
    f('deposit_percent','Sinal (%)','number',{required:false,min:0,max:100,step:'0.01',hint:'Percentual do total exigido para confirmar o evento. Em branco usa 30%.'}),
    status(['rascunho','enviado','aprovado','recusado','expirado']),f('notes','Condições / observações','textarea',{required:false})]},
  installments: {label:'Parcelas e sinal',singular:'parcela',group:'Financeiro',columns:['event_id','due_date','amount','paid_amount','paid_at','kind'],fields:[
    ref('event_id','Evento','events'),f('due_date','Vencimento','date'),money('amount','Valor (R$)'),money('paid_amount','Valor pago (R$)'),
    f('paid_at','Data do pagamento','date',{required:false}),f('kind','Tipo','select',{options:['sinal','parcela']}),f('notes','Observações','textarea',{required:false})]},
  users: {label:'Usuários',singular:'usuário',group:'Administração',columns:['name','login','role','status'],fields:[f('name','Nome'),f('login','Login'),f('password','Senha','password',{required:false,hint:'8 a 128 caracteres. Obrigatória no cadastro; em branco mantém a senha.'}),f('role','Perfil','select',{options:['administrador','atendimento','operacoes']}),status(['ativo','inativo'])]}
} satisfies Record<string, EntityDefinition>;
export type Entity = 'clients'|'events'|'event_guests'|'event_menu_items'|'event_items'|'menus'|'menu_items'|'menu_compositions'|'price_bands'|'child_bands'|'suppliers'|'event_suppliers'|'employees'|'event_staff'|'quotes'|'installments'|'users';
export const entityNames = Object.keys(entities) as Entity[];
export const definition = (entity: Entity): EntityDefinition => entities[entity];
export interface User {id:number; name:string; login:string; role:Role;}
export interface AppInfo { needsSetup:boolean; mode:'mysql'|'demo'; apiMode:'demo'|'live'; user:User|null; }
export type Result<T> = {ok:true;data:T} | {ok:false;error:string};
export interface Dashboard {completed:number;events:Row[];clients:number;activeEvents:number;guests:number;approved:number;pipeline:number;}
export interface EmailPreview { token:string; to:string; subject:string; text:string; demo:boolean; }
export interface ApiReply {source:string;queriedAt:string;demo:boolean;[key:string]:unknown;}
export interface CancellationPreview {days:number;percent:number;paid:string;penalty:string;refund:string;}
export interface TechnicalData {migrations:Row[];attempts:Row[];}
export interface CrudApi {list:()=>Promise<Result<Row[]>>;save:(data:Input,id?:number)=>Promise<Result<Row>>;remove:(id:number)=>Promise<Result<void>>;}
export type DesktopApi = Record<Entity,CrudApi> & {
  info:()=>Promise<Result<AppInfo>>;
  setup:(data:{name:string;login:string;password:string})=>Promise<Result<User>>;
  login:(data:{login:string;password:string})=>Promise<Result<User>>;
  logout:()=>Promise<Result<void>>;
  dashboard:()=>Promise<Result<Dashboard>>;
  archive:(entity:'events'|'quotes',id:number,archived:boolean)=>Promise<Result<void>>;
  cancelPreview:(eventId:number)=>Promise<Result<CancellationPreview>>;
  cancelEvent:(data:{eventId:number;reason:string;penalty?:string;refund?:string})=>Promise<Result<Row>>;
  cancellations:()=>Promise<Result<Row[]>>;
  changeHistory:(quoteId:number)=>Promise<Result<Row[]>>;
  financePlan:(data:{eventId:number;count:number})=>Promise<Result<Row[]>>;
  applyMenu:(eventId:number)=>Promise<Result<Row[]>>;
  technical:()=>Promise<Result<TechnicalData>>;
  cep:(cep:string)=>Promise<Result<ApiReply>>;
  weather:(eventId:number)=>Promise<Result<ApiReply>>;
  geocode:(address:string)=>Promise<Result<ApiReply>>;
  route:(data:{origin:[number,number];destination:[number,number]}|{eventId:number})=>Promise<Result<ApiReply>>;
  emailPreview:(data:{quoteId:number;kind:'orcamento'|'confirmacao'})=>Promise<Result<EmailPreview>>;
  emailSend:(token:string)=>Promise<Result<ApiReply>>;
  emailHistory:()=>Promise<Result<Row[]>>;
  exportReport:()=>Promise<Result<string>>;
};
declare global { interface Window { buffet: DesktopApi; } }

