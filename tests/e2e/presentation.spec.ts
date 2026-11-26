import {_electron as electron,expect,test} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {entityNames} from '../../src/shared/models';

test('apresenta todas as funções, controla o roteiro e preserva os dados e a tela anterior',async()=>{
  test.setTimeout(120_000);
  const directory=await mkdtemp(join(tmpdir(),'buffet-presentation-'));
  const env={...process.env,DB_MODE:'demo',API_MODE:'demo',BUFFET_DATA_DIR:directory};
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
  try {
    app=await electron.launch({args:['.'],env,timeout:20_000});
    const page=await app.firstWindow();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByLabel('Login',{exact:true}).fill('buffet');
    await page.getByLabel('Senha',{exact:true}).fill('atelie123');
    await page.getByRole('button',{name:'Entrar no ateliê'}).click();
    await page.locator('nav [data-view="clients"]').click();
    await page.getByRole('searchbox',{name:'Buscar registros'}).fill('Marina');
    const snapshot=()=>page.evaluate(async names=>({
      entities:await Promise.all(names.map(name=>window.buffet[name].list())),
      emails:await window.buffet.emailHistory()
    }),entityNames);
    const before=await snapshot();
    await page.clock.install();
    await page.getByRole('button',{name:'Modo apresentação'}).click();
    const tour=page.getByRole('dialog',{name:'Modo apresentação',exact:true});
    await expect(tour).toBeVisible();
    await expect(tour.locator('#presentation-status')).toContainText('Reproduzindo');
    await page.clock.runFor(6100);
    await expect(tour.locator('#presentation-status')).toContainText('Etapa 2');
    await tour.getByRole('button',{name:'Pausar',exact:true}).click();
    const paused=await tour.locator('#presentation-status').innerText();
    await page.clock.runFor(20_000);
    await expect(tour.locator('#presentation-status')).toHaveText(paused);

    // Every chapter and phase must render, including all entity fields and references.
    const chapters=tour.locator('[data-chapter]');
    for(let index=0;index<await chapters.count();index++){
      await chapters.nth(index).click();
      await expect(tour.locator('#presentation-stage')).not.toBeEmpty();
      for(let phase=1;phase<4;phase++){
        await tour.getByRole('button',{name:'Próxima etapa',exact:true}).click();
        await expect(tour.locator('.presentation-step>span')).toHaveText(`${phase+1} / 4`);
        if(phase===2&&await tour.locator('[data-field]').count()){
          const emptyRequired=await tour.locator('.field').evaluateAll(fields=>fields.filter(field=>field.querySelector('label')?.textContent?.includes('*')).filter(field=>!(field.querySelector('input,select,textarea') as HTMLInputElement)?.value).map(field=>field.textContent));
          expect(emptyRequired).toEqual([]);
        }
      }
    }
    await tour.getByRole('button',{name:'Limpar seleção',exact:true}).click();
    await expect(tour.getByRole('button',{name:'Continuar',exact:true})).toBeDisabled();
    await expect(tour.locator('#presentation-count')).toContainText('0 de');
    await tour.locator('[data-chapter]').filter({hasText:'Clientes'}).click();
    await expect(tour.locator('#presentation-count')).toContainText('1 de');
    await tour.getByLabel('Ritmo da apresentação',{exact:true}).selectOption('3000');
    await tour.getByRole('button',{name:'Continuar',exact:true}).click();
    await page.clock.runFor(6100);
    await expect(tour.locator('.presentation-step>span')).toHaveText('3 / 4');
    await page.clock.runFor(1800);
    await expect(tour.locator('#tour-field-name')).toHaveValue('Marina Oliveira');
    await page.clock.runFor(4300);
    await expect(tour.locator('#presentation-status')).toContainText('Apresentação concluída');
    await expect(tour.locator('#presentation-progress')).toHaveJSProperty('value',100);
    await tour.getByRole('button',{name:'Reproduzir novamente',exact:true}).click();
    await expect(tour.locator('.presentation-step>span')).toHaveText('1 / 4');
    await tour.getByRole('button',{name:'Pausar',exact:true}).click();
    await tour.getByRole('button',{name:'Selecionar todas',exact:true}).click();
    await tour.locator('[data-chapter]').filter({hasText:'Eventos'}).click();
    await tour.getByRole('button',{name:'Próxima etapa',exact:true}).click();
    await tour.getByRole('button',{name:'Próxima etapa',exact:true}).click();
    await tour.locator('#presentation-stage').evaluate(stage=>stage.scrollTop=0);
    await page.screenshot({path:'.data/presentation-desktop.png'});
    await page.setViewportSize({width:700,height:700});
    await page.screenshot({path:'.data/presentation-compact.png'});
    expect(await tour.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await expect(tour.getByRole('button',{name:'Sair da apresentação'})).toBeInViewport();
    await expect(tour.getByRole('button',{name:'Próxima etapa',exact:true})).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(tour).toHaveCount(0);
    await expect(page.getByRole('searchbox',{name:'Buscar registros'})).toHaveValue('Marina');
    await expect(page.getByRole('button',{name:'Modo apresentação'})).toBeFocused();
    await page.clock.runFor(30_000);
    expect(await snapshot()).toEqual(before);
    expect(errors).toEqual([]);
    await page.getByRole('button',{name:'Modo apresentação'}).click();
    await expect(page.locator('.presentation-dialog')).toHaveCount(1);
    await page.getByRole('button',{name:'Sair da apresentação'}).click();
    await expect(page.locator('.presentation-dialog')).toHaveCount(0);
  }finally{
    try{await app?.close();}finally{await rm(directory,{recursive:true,force:true});}
  }
});
