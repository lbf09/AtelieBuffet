import {definition, type Entity, type Row} from '../shared/models';

export interface PresentationChapter {id:string;title:string;group:string;description:string;entity?:Entity;}

/** Only fictional fixtures. This module never imports or calls the desktop API. */
export function presentationSamples():Record<Entity,Row> {
  const future=new Date();future.setDate(future.getDate()+14);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(future);
  return {
    clients:{id:1,name:'Marina Oliveira',email:'marina@example.com',phone:'(19) 00000-0101',notes:'Cliente fictícia da apresentação. Preferência por opções vegetarianas.'},
    events:{id:1,name:'Celebração da Marina',client_id:1,type:'aniversario',setup_at:`${date}T14:00`,starts_at:`${date}T18:00`,ends_at:`${date}T22:00`,teardown_at:`${date}T23:00`,adults:55,guests:60,menu_id:1,venue:'Casa do Jardim',outdoors:'aberto',postal_code:'13010-111',street:'Praça de demonstração',number:'100',district:'Centro',city:'Campinas',state:'SP',latitude:-22.9056,longitude:-47.0608,status:'rascunho',notes:'Evento fictício. Preparar uma alternativa coberta.'},
    event_guests:{id:1,event_id:1,child_band_id:1,quantity:5},
    event_menu_items:{id:1,event_id:1,item_id:1,quantity:120},
    event_items:{id:1,event_id:1,item_id:1,quantity:20,unit_price:6.5},
    menus:{id:1,name:'Essencial brasileiro',description:'Sabores afetivos para reunir pessoas.',status:'ativo'},
    menu_items:{id:1,name:'Mini quiche',description:'Quiche artesanal de legumes.',unit:'unidade',price:6.5,cost:2.8,restrictions:'Contém leite, ovos e glúten.'},
    menu_compositions:{id:1,menu_id:1,item_id:1,quantity:2},
    price_bands:{id:1,menu_id:1,min_guests:1,max_guests:60,price_per_adult:95,min_billing_guests:0},
    child_bands:{id:1,label:'6 a 10 anos',min_age:6,max_age:10,percent:50,status:'ativo'},
    suppliers:{id:1,name:'Flora Cenografia',category:'Decoração',contact:'Clara',phone:'(19) 00000-0404',email:'flora@example.com',status:'ativo'},
    event_suppliers:{id:1,event_id:1,supplier_id:1,service:'Decoração do espaço',cost:800,status:'confirmado'},
    employees:{id:1,name:'Ana Costa',job:'Coordenação',phone:'(19) 00000-0505',email:'ana@example.com',status:'ativo'},
    event_staff:{id:1,event_id:1,employee_id:1,job:'Coordenação',starts_at:`${date}T14:00`,ends_at:`${date}T23:00`,cost:450},
    quotes:{id:1,event_id:1,version:1,valid_until:date,distance_km:30,rate_km:2.5,trips:'2',distance_source:'manual',extra:0,discount:0,tax_percent:6,deposit_percent:30,status:'rascunho',notes:'Proposta fictícia. Valores ilustrativos.',total:7407.35,margin_amount:4780.65},
    installments:{id:1,event_id:1,due_date:date,amount:2222.21,paid_amount:2222.21,paid_at:date,kind:'sinal',notes:'Pagamento fictício para demonstrar a confirmação do evento.'},
    users:{id:1,name:'Camila Santos',login:'camila.demo',password:'Exemplo123!',role:'atendimento',status:'ativo'}
  };
}

const descriptions:Record<Entity,string>={
  clients:'Cadastre contatos e preferências para começar o relacionamento com o cliente.',
  events:'Conecte cliente, datas, endereço, convidados e cardápio em um único evento.',
  event_guests:'Informe crianças por faixa de idade para compor a contagem e o preço.',
  event_menu_items:'Revise as quantidades calculadas e faça os ajustes da operação.',
  event_items:'Inclua itens adicionais com quantidade e preço negociado.',
  menus:'Organize os cardápios disponíveis para suas propostas.',
  menu_items:'Registre sabores, unidades, preço, custo e alérgenos.',
  menu_compositions:'Defina quanto de cada item servir por convidado.',
  price_bands:'Configure o preço por adulto conforme o total de convidados.',
  child_bands:'Defina qual percentual do adulto cada faixa de idade paga.',
  suppliers:'Mantenha os contatos dos parceiros e suas especialidades.',
  event_suppliers:'Vincule serviços, fornecedores e valores a cada evento.',
  employees:'Organize as pessoas e funções da equipe.',
  event_staff:'Distribua horários, funções e custos por evento. O app verifica conflitos de agenda.',
  quotes:'Monte propostas com pacote, serviços, frete, impostos e sinal.',
  installments:'Acompanhe vencimentos, pagamentos e o sinal necessário para confirmar o evento.',
  users:'Gerencie acessos com os perfis de administrador, atendimento e operações.'
};

export function presentationChapters(canRead:(entity:Entity)=>boolean):PresentationChapter[] {
  const chapter=(entity:Entity):PresentationChapter=>({id:entity,entity,title:definition(entity).label,group:definition(entity).group,description:descriptions[entity]});
  const chapters:PresentationChapter[]=[{id:'dashboard',title:'Visão geral',group:'Comece por aqui',description:'Da agenda aos próximos preparativos: conheça o caminho de uma celebração.'}];
  const order:Entity[]=['clients','events','menus','menu_items','menu_compositions','price_bands','child_bands','event_guests','event_menu_items','event_items','suppliers','event_suppliers','employees','event_staff','quotes','installments','users'];
  chapters.push(...order.filter(canRead).map(chapter));
  if(canRead('events')) chapters.push({id:'integrations',title:'Endereço, rota e clima',group:'Recursos do evento',description:'Veja como as consultas ajudam a planejar o local, o transporte e eventos ao ar livre.'});
  if(canRead('quotes')) chapters.push(
    {id:'proposal',title:'Proposta e versões',group:'Recursos do evento',description:'Revise a composição do orçamento, acompanhe alterações e exporte o relatório.'},
    {id:'payments',title:'Confirmação e cancelamento',group:'Recursos do evento',description:'Do orçamento aprovado ao sinal pago, com parcelas e política de cancelamento.'},
    {id:'email',title:'E-mails e histórico',group:'Recursos do evento',description:'Confira a mensagem antes do envio e acompanhe as tentativas no histórico.'}
  );
  if(canRead('users')) chapters.push({id:'technical',title:'Dados técnicos',group:'Administração',description:'Consulte as migrações do banco e as tentativas de envio registradas.'});
  return chapters;
}

export const presentationPhases=['Conheça a função','Abra o cadastro','Preencha os dados','Confira o resultado'] as const;
