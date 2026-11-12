import {bootstrap} from './bootstrap';
import {app,BrowserWindow,dialog,Menu,session} from 'electron';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import dotenv from 'dotenv';
import {Database} from './database';
import {AuthService} from './services/auth-service';
import {EntityRepository} from './repositories/entity-repository';
import {BusinessService} from './services/business-service';
import {IntegrationService} from './services/integration-service';
import {IpcController} from './controllers/ipc-controller';
import {seedDemo} from './seed';

if(!app.isPackaged) {dotenv.config({quiet:true});app.setPath('userData',process.env.BUFFET_DATA_DIR||join(process.cwd(),'.data','app'));}
// SQLite local e o modo de integração são configurados separadamente.
const mode=app.isPackaged||process.env.DB_MODE!=='mysql'?'demo':'mysql';
const apiMode=process.env.API_MODE==='live'?'live':'demo';
let database:Database;let window:BrowserWindow|null=null;
const locked=app.requestSingleInstanceLock();
if(!locked) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(async()=>{
    database=new Database(mode,mode==='demo'?join(app.getPath('userData'),'buffet.sqlite'):undefined);
    await database.connect();
    if(mode==='demo') {await database.migrate(readFileSync(join(__dirname,'../database/001_initial.sql'),'utf8'));await seedDemo(database);}
    else {const versions=await database.query('SELECT version FROM schema_migrations WHERE version=1');if(!versions.length) throw new Error('Migração pendente.');}
    await bootstrap(database);
    const auth=new AuthService(database);const business=new BusinessService(new EntityRepository(database),auth);const integrations=new IntegrationService(business,apiMode);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    window=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'Ateliê Buffet',backgroundColor:'#f7f7f2',show:false,webPreferences:{preload:join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false,devTools:!app.isPackaged}});
    const page=join(__dirname,'../renderer/index.html');
    const url=pathToFileURL(page).href;
    window.webContents.on('will-navigate',(event)=>event.preventDefault());
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-attach-webview',(event)=>event.preventDefault());
    new IpcController(window,url,business,integrations).install();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Aplicativo',submenu:[{role:'reload',label:'Recarregar'},{role:'quit',label:'Sair'}]},{label:'Editar',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Visualizar',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
    window.once('ready-to-show',()=>window?.show());
    await window.loadFile(page);
  }).catch(()=>{dialog.showErrorBox('Não foi possível iniciar','Confira o MySQL e execute npm run db:migrate. Para a demonstração sem MySQL, use npm run demo. Consulte o README para configuração.');app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{void database?.close();});
}
