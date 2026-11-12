import {z} from 'zod';
import {BusinessError} from '../../shared/validation';

export class ProviderHttpError extends BusinessError {
  constructor(readonly status:number,message:string) {super(message);}
}

export class ProviderHttp {
  async json<T>(
    provider:string,url:string,schema:z.ZodType<T>,init:RequestInit={},
    statusMessages:Partial<Record<number,string>>={}
  ):Promise<T> {
    try {
      const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok) {
        await response.body?.cancel().catch(()=>{});
        const message=statusMessages[response.status]??(response.status===429
          ?'Limite de requisições atingido. Aguarde e tente novamente.'
          :`Serviço indisponível (HTTP ${response.status}). Tente novamente mais tarde.`);
        throw new ProviderHttpError(response.status,`${provider}: ${message}`);
      }
      if(!response.body) throw new BusinessError(`${provider}: resposta vazia.`);
      const reader=response.body.getReader();
      const chunks:Uint8Array[]=[];
      let size=0;
      while(true) {
        const {done,value}=await reader.read();
        if(done) break;
        size+=value.length;
        if(size>1024*1024) {
          await reader.cancel().catch(()=>{});
          throw new BusinessError(`${provider}: resposta excedeu o limite de tamanho.`);
        }
        chunks.push(value);
      }
      if(!size) throw new BusinessError(`${provider}: resposta vazia.`);
      const result=schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if(!result.success) throw new BusinessError(`${provider}: resposta inválida ou incompleta.`);
      return result.data;
    } catch(error) {
      if(error instanceof BusinessError) throw error;
      if(error instanceof SyntaxError) throw new BusinessError(`${provider}: resposta JSON inválida.`);
      throw new BusinessError(`${provider}: falha de conexão ou tempo limite excedido.`);
    }
  }
}
