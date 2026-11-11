import { definition, entityNames, type Entity, type Input, type Value } from './models';

export class BusinessError extends Error {}
export function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new BusinessError(message); }
export function validId(value: unknown): number { assert(Number.isSafeInteger(value) && Number(value)>0,'Identificador inválido.'); return Number(value); }
export function validEntity(value: unknown): Entity { assert(typeof value==='string' && entityNames.includes(value as Entity),'Cadastro desconhecido.'); return value as Entity; }
export function asObject(value:unknown): Input { assert(value && typeof value==='object' && !Array.isArray(value),'Dados inválidos.'); return value as Input; }
export function validDate(value: string, datetime = false): boolean {
  if (!(datetime ? /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false;
  const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  if (year<2000 || year>2100 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) return false;
  return !datetime || (Number(value.slice(11,13))<24 && Number(value.slice(14,16))<60 && Number(value.slice(17,19)||0)<60);
}
export function today(): string { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function cents(value:unknown): number {
  const text=String(value);
  assert(/^\d+(\.\d{1,2})?$/.test(text),'Use um valor positivo com até duas casas decimais.');
  const [whole,fraction='']=text.split('.');
  const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  assert(Number.isSafeInteger(result)&&result<=9999999999,'Valor monetário fora do limite.');
  return result;
}
export const decimal = (value:number): string => {assert(Number.isSafeInteger(value)&&value>=0&&value<=9999999999,'Total fora do limite permitido.');return (value/100).toFixed(2);};
// Quantidade com três casas × centavos, arredondando meia unidade para cima.
export function lineTotal(quantity:unknown,price:unknown):number {
  const thousandths=Math.round(Number(quantity)*1000);
  assert(Number.isSafeInteger(thousandths)&&thousandths>=0,'Quantidade inválida.');
  return Number((BigInt(thousandths)*BigInt(cents(price))+500n)/1000n);
}
export class Validator {
  entity(entity:Entity, raw:unknown, editing=false):Record<string,Value> {
    const input=asObject(raw), output:Record<string,Value>={};
    const fields=definition(entity).fields;
    assert(Object.keys(input).every(k=>fields.some(f=>f.key===k)),'Há campos não permitidos neste cadastro.');
    for (const field of fields) {
      const value=input[field.key];
      if (value===undefined || value===null || value==='') {
        if (field.key==='password' && editing) continue;
        assert(!field.required,`Preencha ${field.label}.`);
        output[field.key]=field.type==='number'||field.type==='date'?null:'';
        continue;
      }
      assert(typeof value==='string'||typeof value==='number',`${field.label}: formato inválido.`);
      const text=String(value).trim();
      assert(text.length<=(field.type==='textarea'?2000:field.type==='password'?128:200),`${field.label}: texto muito longo.`);
      assert(!field.required||text.length>0,`Preencha ${field.label}.`);
      if (field.ref) output[field.key]=validId(Number(value));
      else if (field.type==='money') output[field.key]=decimal(cents(value));
      else if (field.type==='number') {
        const n=Number(value);
        assert(Number.isFinite(n)&&n>=(field.min??0)&&n<=(field.max??Number.MAX_SAFE_INTEGER),`${field.label}: valor fora do intervalo.`);
        if (!field.step) assert(Number.isInteger(n),`${field.label} deve ser inteiro.`);
        if (field.step==='0.001') assert(Math.abs(n*1000-Math.round(n*1000))<1e-6,`${field.label}: use até três casas decimais.`);
        output[field.key]=n;
      } else {
        if(field.options) assert(field.options.includes(text),`${field.label}: opção inválida.`);
        if(field.type==='email') assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text),`${field.label} inválido.`);
        if(field.type==='date'||field.type==='datetime-local') assert(validDate(text,field.type==='datetime-local'),`${field.label}: data inválida.`);
        output[field.key]=field.type==='datetime-local'?text.replace('T',' ').slice(0,16)+':00':field.type==='password'?String(value):text;
      }
    }
    if(entity==='events') {
      assert(/^\d{5}-?\d{3}$/.test(String(output.postal_code)),'CEP deve ter 8 dígitos.');
      assert(/^[A-Za-z]{2}$/.test(String(output.state)),'Informe a UF com duas letras.'); output.state=String(output.state).toUpperCase();
      assert(output.setup_at!<=output.starts_at! && output.starts_at!<output.ends_at! && output.ends_at!<=output.teardown_at!,'Use montagem ≤ início < fim ≤ desmontagem.');
      assert((output.latitude===null)===(output.longitude===null),'Informe latitude e longitude juntas.');
    }
    if(entity==='event_staff') assert(output.starts_at!<output.ends_at!,'O fim da escala deve ser posterior ao início.');
    return output;
  }
}
