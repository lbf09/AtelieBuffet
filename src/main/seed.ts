import {Database} from './database';

// Exclusivamente dados fictícios. Não há senha padrão nem contato real.
export async function seedDemo(db:Database):Promise<void> {
  if((await db.query('SELECT id FROM clients LIMIT 1')).length) return;
  const day=(offset:number)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  await db.transaction(async()=>{
    const c1=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Marina Oliveira','marina@example.com','(19) 00000-0101','Cadastro fictício para apresentação.']);
    const c2=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Horizonte Studio','eventos@example.com','(19) 00000-0202','Empresa fictícia.']);
    const c3=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Rafael e Luiza','casamento@example.com','(19) 00000-0303','Cadastro fictício.']);
    const menu=await db.execute("INSERT INTO menus(name,description,status) VALUES('Essencial brasileiro','Sabores afetivos para reunir pessoas.','ativo')");
    const items=[];
    for(const [name,unit,price,restrictions] of [['Mini quiche','unidade','6.50','Contém leite, ovos e glúten'],['Mesa brasileira','pessoa','89.90','Consultar composição'],['Suco natural','litro','18.00','Sem adição de açúcar'],['Mini sobremesas','unidade','8.00','Contém leite']]) {
      const id=await db.execute('INSERT INTO menu_items(name,description,unit,price,restrictions) VALUES(?,?,?,?,?)',[name,'Item de demonstração',unit,price,restrictions]);items.push(id);await db.execute('INSERT INTO menu_compositions(menu_id,item_id,quantity) VALUES(?,?,?)',[menu,id,1]);
    }
    const supplier=await db.execute("INSERT INTO suppliers(name,category,contact,phone,email,status) VALUES('Flora Cenografia','Decoração','Clara','(19) 00000-0404','flora@example.com','ativo')");
    const employee=await db.execute("INSERT INTO employees(name,job,phone,email,status) VALUES('Ana Costa','Coordenação','(19) 00000-0505','ana@example.com','ativo')");
    await db.execute("INSERT INTO employees(name,job,phone,email,status) VALUES('Pedro Lima','Cozinha','(19) 00000-0606','pedro@example.com','ativo')");
    for(const [i,config] of [{client:c1,name:'Um novo ciclo · Marina',type:'aniversario',guests:60,offset:4,venue:'Casa do Jardim',open:'aberto'},{client:c2,name:'Encontro Horizonte',type:'corporativo',guests:120,offset:9,venue:'Espaço Central',open:'fechado'},{client:c3,name:'O sim de Rafael & Luiza',type:'casamento',guests:180,offset:20,venue:'Quinta das Flores',open:'aberto'}].entries()) {
      const date=day(config.offset);
      const event=await db.execute('INSERT INTO events(client_id,name,type,setup_at,starts_at,ends_at,teardown_at,guests,venue,outdoors,postal_code,street,number,district,city,state,latitude,longitude,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[config.client,config.name,config.type,`${date} 14:00:00`,`${date} 18:00:00`,`${date} 22:00:00`,`${date} 23:00:00`,config.guests,config.venue,config.open,'13010-111','Praça de demonstração','100','Centro','Campinas','SP',-22.9056,-47.0608,'rascunho','Evento fictício. Regras comerciais a confirmar.']);
      await db.execute('INSERT INTO event_items(event_id,item_id,quantity,unit_price) VALUES(?,?,?,?)',[event,items[1],config.guests,'89.90']);
      await db.execute('INSERT INTO event_items(event_id,item_id,quantity,unit_price) VALUES(?,?,?,?)',[event,items[0],config.guests*4,'6.50']);
      await db.execute("INSERT INTO event_suppliers(event_id,supplier_id,service,cost,status) VALUES(?,?,? ,?,'previsto')",[event,supplier,'Decoração do espaço',String(800+i*300)]);
      await db.execute('INSERT INTO event_staff(event_id,employee_id,job,starts_at,ends_at,cost) VALUES(?,?,?,?,?,?)',[event,employee,'Coordenação',`${date} 14:00:00`,`${date} 23:00:00`,'450.00']);
    }
  });
}
