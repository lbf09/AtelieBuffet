import {ipcMain,dialog,BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import {entityNames,type Result} from '../../shared/models';
import {assert,BusinessError,asObject,validId} from '../../shared/validation';
import {BusinessService} from '../services/business-service';
import {IntegrationService} from '../services/integration-service';
import {ZodError} from 'zod';

export class IpcController {
  constructor(private win:BrowserWindow,private pageUrl:string,private business:BusinessService,private integrations:IntegrationService) {}
  private register(channel:string,handler:(...args:unknown[])=>Promise<unknown>):void {
    ipcMain.handle(channel,async(event,...args):Promise<Result<unknown>>=>{
      try {
        assert(event.sender===this.win.webContents&&event.senderFrame===event.sender.mainFrame&&event.senderFrame?.url===this.pageUrl,'Origem da operação não autorizada.');
        return {ok:true,data:await this.business.repo.db.exclusive(()=>handler(...args))};
      } catch(error) {
        let message='Não foi possível concluir a operação. Tente novamente.';
        if(error instanceof BusinessError) message=error.message;
        else if(error instanceof ZodError) message='Dados inválidos. Confira os campos ou a resposta do serviço.';
        else if(/FOREIGN KEY|foreign key constraint|ER_ROW_IS_REFERENCED|ER_NO_REFERENCED_ROW/i.test(String(error))) message='Este registro possui vínculos, ou um vínculo deixou de existir. Remova os vínculos permitidos antes de excluir; registros históricos devem ser mantidos.';
        else if(/UNIQUE|Duplicate entry|ER_DUP_ENTRY/i.test(String(error))) message='Já existe um registro com esse login ou combinação de vínculos.';
        return {ok:false,error:message};
      }
    });
  }
  install():void {
    const auth=this.business.auth;
    this.register('app:info',async()=>({needsSetup:await auth.needsSetup(),mode:this.business.repo.db.mode,apiMode:this.integrations.mode,user:await auth.user(false)}));
    this.register('auth:setup',async(raw)=>{const user=await auth.setup(raw);return user;});
    this.register('auth:login',async(raw)=>auth.login(raw));
    this.register('auth:logout',async()=>auth.logout());
    this.register('dashboard:read',async()=>this.business.dashboard());
    for(const entity of entityNames) {
      this.register(`${entity}:list`,async()=>this.business.list(entity));
      this.register(`${entity}:save`,async(raw,id)=>this.business.save(entity,asObject(raw),id===undefined?undefined:validId(id)));
      this.register(`${entity}:remove`,async(id)=>this.business.remove(entity,validId(id)));
    }
    this.register('integration:cep',async(raw)=>this.integrations.cep(raw));
    this.register('integration:weather',async(raw)=>this.integrations.weather(raw));
    this.register('integration:geocode',async(raw)=>this.integrations.geocode(raw));
    this.register('integration:route',async(raw)=>this.integrations.route(raw));
    this.register('email:preview',async(raw)=>this.integrations.previewEmail(raw));
    this.register('email:send',async(raw)=>this.integrations.sendEmail(raw));
    this.register('email:history',async()=>this.integrations.history());
    this.register('report:export',async()=>{
      await this.business.authorize('quotes');
      const events=await this.business.list('events');const quotes=await this.business.list('quotes');
      const escape=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
      const csv=[['Evento','Data','Situação','Convidados','Versão do orçamento','Situação do orçamento','Total (R$)'],...events.flatMap(event=>{
        const related=quotes.filter(q=>q.event_id===event.id);
        return (related.length?related:[null]).map(q=>[event.name,event.starts_at,event.status,event.guests,q?.version??'',q?.status??'',q?.total??'']);
      })].map(row=>row.map(escape).join(';')).join('\r\n');
      const path=await dialog.showSaveDialog(this.win,{title:'Exportar relatório',defaultPath:'relatorio-buffet.csv',filters:[{name:'Planilha CSV',extensions:['csv']}]});
      if(path.canceled||!path.filePath) return 'Exportação cancelada.';
      await writeFile(path.filePath,'\ufeff'+csv,{encoding:'utf8'});return 'Relatório exportado com sucesso.';
    });
  }
}
