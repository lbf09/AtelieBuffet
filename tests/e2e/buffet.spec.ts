import {_electron as electron, expect, test, type Page} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {entities, entityNames} from '../../src/shared/models';
import {today} from '../../src/shared/validation';

async function signIn(page:Page):Promise<void> {
  await page.getByLabel('Login').fill('buffet');
  await page.getByLabel('Senha').fill('atelie123');
  await page.getByRole('button',{name:'Entrar no ateliê'}).click();
  await expect(page.getByRole('heading',{name:'Agenda do buffet'})).toBeVisible();
}

function openView(page:Page,view:string) {
  return page.locator(`nav [data-view="${view}"]`).click();
}

test('navega pelos cadastros, cria evento e orçamento, e verifica a persistência',async()=>{
  test.setTimeout(90_000);
  const directory=await mkdtemp(join(tmpdir(),'buffet-e2e-'));
  const env={...process.env,DB_MODE:'demo',API_MODE:'demo',BUFFET_DATA_DIR:directory};
  const launch=()=>electron.launch({args:['.'],env,timeout:20_000});
  const eventName='Evento fictício do teste';
  const clientName='Cliente fictício do teste';
  const pageErrors:string[]=[];
  let app:Awaited<ReturnType<typeof launch>>|undefined;
  try {
    app=await launch();
    let page=await app.firstWindow();
    page.on('pageerror',error=>pageErrors.push(error.message));
    await signIn(page);
    for(const entity of entityNames) {
      await test.step(`abre ${entities[entity].label}`,async()=>{
        await openView(page,entity);
        await expect(page.getByRole('heading',{name:entities[entity].label,exact:true})).toBeVisible();
      });
    }
    await openView(page,'technical');
    await expect(page.getByRole('heading',{name:'Dados técnicos',exact:true})).toBeVisible();
    await openView(page,'clients');
    await page.getByRole('button',{name:'Novo cadastro'}).click();
    await page.locator('#field-name').fill(clientName);
    await page.locator('#field-email').fill('teste-buffet@example.com');
    await page.locator('#field-phone').fill('19000000000');
    await page.getByRole('button',{name:'Salvar cadastro'}).click();
    await expect(page.getByRole('row',{name:new RegExp(clientName)})).toBeVisible();

    await openView(page,'events');
    await page.getByRole('button',{name:'Novo cadastro'}).click();
    const date=new Date(Date.parse(today())+7*86_400_000).toISOString().slice(0,10);
    const eventFields={
      name:eventName,setup_at:`${date}T14:00`,starts_at:`${date}T16:00`,ends_at:`${date}T19:00`,teardown_at:`${date}T20:00`,
      adults:'30',venue:'Salão fictício',postal_code:'13484332',street:'Rua fictícia',number:'10',district:'Centro',city:'Limeira',state:'SP'
    };
    for(const [field,value] of Object.entries(eventFields)) await page.locator(`#field-${field}`).fill(value);
    await page.locator('#field-client_id').selectOption({label:clientName});
    await page.locator('#field-menu_id').selectOption({label:'Essencial brasileiro'});
    await page.getByRole('button',{name:'Salvar cadastro'}).click();
    await expect(page.getByRole('row',{name:new RegExp(eventName)})).toBeVisible();

    await openView(page,'quotes');
    await page.getByRole('button',{name:'Novo cadastro'}).click();
    await page.locator('#field-event_id').selectOption({label:eventName});
    await page.getByRole('button',{name:'Salvar cadastro'}).click();
    const quote=page.getByRole('row',{name:new RegExp(eventName)});
    await expect(quote).toContainText(/Rascunho/i);
    await quote.getByRole('button',{name:'Ver proposta'}).click();
    await expect(page.getByText('Pacote do cardápio',{exact:true})).toBeVisible();
    await expect(page.getByText(/30 adultos × R\$/)).toBeVisible();
    await page.getByRole('button',{name:'Prévia do orçamento'}).click();
    await expect(page.getByText('teste-buffet@example.com',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Simular envio'}).click();
    await expect(page.getByRole('heading',{name:'Histórico de e-mails'})).toBeVisible();
    await expect(page.getByRole('row').filter({hasText:/Simulado/i})).toHaveCount(1);

    await app.close();
    app=undefined;
    app=await launch();
    page=await app.firstWindow();
    page.on('pageerror',error=>pageErrors.push(error.message));
    await signIn(page);
    await openView(page,'events');
    await expect(page.getByRole('row',{name:new RegExp(eventName)})).toBeVisible();
    await openView(page,'quotes');
    await expect(page.getByRole('row',{name:new RegExp(eventName)})).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    try {await app?.close();} finally {await rm(directory,{recursive:true,force:true});}
  }
});
