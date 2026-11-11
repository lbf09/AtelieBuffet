import {contextBridge,ipcRenderer} from 'electron';
import {entityNames,type DesktopApi,type CrudApi,type Input} from '../shared/models';

// Os nomes de canal são definidos pelo aplicativo; o renderer não recebe invoke/send genéricos.
const crud=Object.fromEntries(entityNames.map(entity=>[entity,{
  list:()=>ipcRenderer.invoke(`${entity}:list`),
  save:(data:Input,id?:number)=>ipcRenderer.invoke(`${entity}:save`,data,id),
  remove:(id:number)=>ipcRenderer.invoke(`${entity}:remove`,id)
} satisfies CrudApi]));
const api={...crud,
  info:()=>ipcRenderer.invoke('app:info'),
  setup:(data:unknown)=>ipcRenderer.invoke('auth:setup',data),
  login:(data:unknown)=>ipcRenderer.invoke('auth:login',data),
  logout:()=>ipcRenderer.invoke('auth:logout'),
  dashboard:()=>ipcRenderer.invoke('dashboard:read'),
  cep:(cep:string)=>ipcRenderer.invoke('integration:cep',cep),
  weather:(eventId:number)=>ipcRenderer.invoke('integration:weather',eventId),
  geocode:(address:string)=>ipcRenderer.invoke('integration:geocode',address),
  route:(data:unknown)=>ipcRenderer.invoke('integration:route',data),
  emailPreview:(data:unknown)=>ipcRenderer.invoke('email:preview',data),
  emailSend:(token:string)=>ipcRenderer.invoke('email:send',token),
  emailHistory:()=>ipcRenderer.invoke('email:history'),
  exportReport:()=>ipcRenderer.invoke('report:export')
} as DesktopApi;
contextBridge.exposeInMainWorld('buffet',api);
