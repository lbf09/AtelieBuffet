import type {Entity, Row, Value} from '../../shared/models';
import {definition} from '../../shared/models';
import {Database} from '../database';
import {assert,validEntity,validId} from '../../shared/validation';

export class EntityRepository {
  constructor(readonly db:Database) {}
  async list(entity:Entity):Promise<Row[]> {
    validEntity(entity);
    // Senhas e hashes nunca atravessam a fronteira IPC.
    return this.db.query(`SELECT ${entity==='users'?'id,name,login,role,status':'*'} FROM ${entity} ORDER BY id DESC`);
  }
  async find(entity:Entity,id:number):Promise<Row> {
    validEntity(entity);validId(id);
    const rows=await this.db.query(`SELECT * FROM ${entity} WHERE id = ?`,[id]);
    assert(rows.length,'Registro não encontrado.');return rows[0];
  }
  async save(entity:Entity,data:Record<string,Value>,id?:number):Promise<Row> {
    validEntity(entity);
    const allowed=new Set([...definition(entity).fields.map(f=>f.key),'password_hash','created_by','version','subtotal','freight','total','snapshot','guests','margin_amount','tax_amount','deposit_required']);
    const keys=Object.keys(data);assert(keys.every(k=>allowed.has(k)),'Campo não permitido.');
    if(id) {validId(id);await this.find(entity,id);await this.db.execute(`UPDATE ${entity} SET ${keys.map(k=>`${k} = ?`).join(',')} WHERE id = ?`,[...keys.map(k=>data[k]),id]);}
    else id=await this.db.execute(`INSERT INTO ${entity} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(k=>data[k]));
    const saved=await this.find(entity,id);delete saved.password_hash;return saved;
  }
  async remove(entity:Entity,id:number):Promise<void> {validEntity(entity);validId(id);await this.find(entity,id);await this.db.execute(`DELETE FROM ${entity} WHERE id = ?`,[id]);}
}
