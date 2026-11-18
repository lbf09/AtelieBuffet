import {Database} from './database';

// Exclusivamente dados fictícios. Não há senha padrão nem contato real.
export async function seedDemo(db:Database):Promise<void> {
  if((await db.query('SELECT id FROM clients LIMIT 1')).length) {await backfillDemo(db);return;}
  await runSeed(db);
}

// Bancos demo criados antes da cobrança comercial recebem a configuração que falta,
// preservando os registros existentes do usuário.
async function backfillDemo(db:Database):Promise<void> {
  // Só atualiza bancos demo anteriores à cobrança comercial, sem tocar em configurações já feitas.
  if((await db.query('SELECT id FROM price_bands LIMIT 1')).length) return;
  const menus=await db.query('SELECT id FROM menus ORDER BY id');
  if(!menus.length) return;
  await db.transaction(async()=>{
    if(!(await db.query('SELECT id FROM child_bands LIMIT 1')).length) {
      await db.execute("INSERT INTO child_bands(label,min_age,max_age,percent,status) VALUES('0 a 5 anos',0,5,0,'ativo')");
      await db.execute("INSERT INTO child_bands(label,min_age,max_age,percent,status) VALUES('6 a 10 anos',6,10,50,'ativo')");
    }
    for(const menu of menus) {
      if((await db.query('SELECT id FROM price_bands WHERE menu_id=? LIMIT 1',[menu.id])).length) continue;
      for(const [min,max,price] of [[1,60,95.00],[61,80,88.00],[81,100,82.00],[101,null,78.00]] as Array<[number,number|null,number]>) {
        await db.execute('INSERT INTO price_bands(menu_id,min_guests,max_guests,price_per_adult,min_billing_guests) VALUES(?,?,?,?,0)',[menu.id,min,max,price]);
      }
    }
    for(const event of await db.query('SELECT id,menu_id,guests FROM events')) {
      const menuId=event.menu_id?Number(event.menu_id):Number(menus[0].id);
      if(!event.menu_id) await db.execute('UPDATE events SET menu_id=? WHERE id=?',[menuId,event.id]);
      if((await db.query('SELECT id FROM event_menu_items WHERE event_id=? LIMIT 1',[event.id])).length) continue;
      for(const row of await db.query('SELECT item_id,quantity FROM menu_compositions WHERE menu_id=?',[menuId])) {
        await db.execute('INSERT INTO event_menu_items(event_id,item_id,quantity) VALUES(?,?,?)',
          [event.id,Number(row.item_id),Math.round(Number(row.quantity)*Number(event.guests)*1000)/1000]);
      }
    }
  });
}

async function runSeed(db:Database):Promise<void> {
  const day=(offset:number)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  await db.transaction(async()=>{
    const c1=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Marina Oliveira','marina@example.com','(19) 00000-0101','Cadastro fictício para apresentação.']);
    const c2=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Horizonte Studio','eventos@example.com','(19) 00000-0202','Empresa fictícia.']);
    const c3=await db.execute('INSERT INTO clients(name,email,phone,notes) VALUES(?,?,?,?)',['Rafael e Luiza','casamento@example.com','(19) 00000-0303','Cadastro fictício.']);

    await db.execute("INSERT INTO child_bands(label,min_age,max_age,percent,status) VALUES('0 a 5 anos',0,5,0,'ativo')");
    const school=await db.execute("INSERT INTO child_bands(label,min_age,max_age,percent,status) VALUES('6 a 10 anos',6,10,50,'ativo')");

    const menu=await db.execute("INSERT INTO menus(name,description,status) VALUES('Essencial brasileiro','Sabores afetivos para reunir pessoas.','ativo')");
    const items:number[]=[];
    const composition:[number,number][]=[];
    for(const [name,unit,price,cost,quantity,restrictions] of [
      ['Mini quiche','unidade',6.50,2.80,2,'Contém leite, ovos e glúten'],
      ['Mesa brasileira','pessoa',89.90,38.00,1,'Consultar composição'],
      ['Suco natural','litro',18.00,7.00,0.3,'Sem adição de açúcar'],
      ['Mini sobremesas','unidade',8.00,3.20,1.5,'Contém leite']
    ] as Array<[string,string,number,number,number,string]>) {
      const id=await db.execute('INSERT INTO menu_items(name,description,unit,price,cost,restrictions) VALUES(?,?,?,?,?,?)',[name,'Item de demonstração',unit,price,cost,restrictions]);
      items.push(id);composition.push([id,quantity]);
    }
    for(const [item,quantity] of composition) await db.execute('INSERT INTO menu_compositions(menu_id,item_id,quantity) VALUES(?,?,?)',[menu,item,quantity]);
    for(const [min,max,price] of [[1,60,95.00],[61,80,88.00],[81,100,82.00],[101,null,78.00]] as Array<[number,number|null,number]>) {
      await db.execute('INSERT INTO price_bands(menu_id,min_guests,max_guests,price_per_adult,min_billing_guests) VALUES(?,?,?,?,0)',[menu,min,max,price]);
    }

    const supplier=await db.execute("INSERT INTO suppliers(name,category,contact,phone,email,status) VALUES('Flora Cenografia','Decoração','Clara','(19) 00000-0404','flora@example.com','ativo')");
    const employee=await db.execute("INSERT INTO employees(name,job,phone,email,status) VALUES('Ana Costa','Coordenação','(19) 00000-0505','ana@example.com','ativo')");
    await db.execute("INSERT INTO employees(name,job,phone,email,status) VALUES('Pedro Lima','Cozinha','(19) 00000-0606','pedro@example.com','ativo')");

    for(const [i,config] of [
      {client:c1,name:'Um novo ciclo · Marina',type:'aniversario',adults:55,children:5,offset:4,venue:'Casa do Jardim',open:'aberto'},
      {client:c2,name:'Encontro Horizonte',type:'corporativo',adults:105,children:15,offset:9,venue:'Espaço Central',open:'fechado'},
      {client:c3,name:'O sim de Rafael & Luiza',type:'casamento',adults:160,children:20,offset:20,venue:'Quinta das Flores',open:'aberto'}
    ].entries()) {
      const date=day(config.offset),guests=config.adults+config.children;
      const event=await db.execute('INSERT INTO events(client_id,name,type,setup_at,starts_at,ends_at,teardown_at,guests,adults,menu_id,venue,outdoors,postal_code,street,number,district,city,state,latitude,longitude,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [config.client,config.name,config.type,`${date} 14:00:00`,`${date} 18:00:00`,`${date} 22:00:00`,`${date} 23:00:00`,guests,config.adults,menu,config.venue,config.open,'13010-111','Praça de demonstração','100','Centro','Campinas','SP',-22.9056,-47.0608,'rascunho','Evento fictício.']);
      await db.execute('INSERT INTO event_guests(event_id,child_band_id,quantity) VALUES(?,?,?)',[event,school,config.children]);
      for(const [item,quantity] of composition) {
        await db.execute('INSERT INTO event_menu_items(event_id,item_id,quantity) VALUES(?,?,?)',[event,item,Math.round(quantity*guests*1000)/1000]);
      }
      await db.execute('INSERT INTO event_items(event_id,item_id,quantity,unit_price) VALUES(?,?,?,?)',[event,items[3],Math.round(guests/2),'8.00']);
      await db.execute("INSERT INTO event_suppliers(event_id,supplier_id,service,cost,status) VALUES(?,?,? ,?,'previsto')",[event,supplier,'Decoração do espaço',String(800+i*300)]);
      await db.execute('INSERT INTO event_staff(event_id,employee_id,job,starts_at,ends_at,cost) VALUES(?,?,?,?,?,?)',[event,employee,'Coordenação',`${date} 14:00:00`,`${date} 23:00:00`,'450.00']);
    }
  });
}
