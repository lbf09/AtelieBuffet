import initSqlJs, {type Database as SqliteDatabase} from 'sql.js';
import mysql, {type Connection, type RowDataPacket, type ResultSetHeader} from 'mysql2/promise';
import {existsSync, readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Row, Value} from '../shared/models';
import {assert} from '../shared/validation';

export class Database {
  private sqlite?:SqliteDatabase;
  private mysql?:Connection;
  private tail:Promise<void>=Promise.resolve();
  constructor(readonly mode:'mysql'|'demo', private file?:string) {}
  async connect():Promise<void> {
    if(this.mode==='demo') {
      const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')});
      this.sqlite=new SQL.Database(this.file&&existsSync(this.file)?readFileSync(this.file):undefined);
      this.sqlite.run('PRAGMA foreign_keys = ON');
    } else {
      this.mysql=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME||'buffet_dad',user:process.env.DB_USER||'buffet_app',password:process.env.DB_PASSWORD||'',dateStrings:true,connectTimeout:8000,multipleStatements:false});
    }
  }
  async query(sql:string, params:Value[]=[]):Promise<Row[]> {
    if(this.sqlite) {
      const statement=this.sqlite.prepare(sql); const rows:Row[]=[];
      try {statement.bind(params); while(statement.step()) rows.push(statement.getAsObject() as Row);} finally {statement.free();}
      return rows;
    }
    const [rows]=await this.mysql!.execute<RowDataPacket[]>(sql,params); return rows as Row[];
  }
  async execute(sql:string,params:Value[]=[]):Promise<number> {
    if(this.sqlite) {this.sqlite.run(sql,params);return Number((await this.query('SELECT last_insert_rowid() AS id'))[0]?.id||0);}
    const [result]=await this.mysql!.execute<ResultSetHeader>(sql,params);return result.insertId;
  }
  // Serializa operações no processo. GET_LOCK também serializa escritores MySQL de outras instâncias do app.
  async exclusive<T>(work:()=>Promise<T>):Promise<T> {
    const previous=this.tail; let release!:()=>void;
    this.tail=new Promise(resolve=>{release=resolve;}); await previous;
    try {return await work();} finally {release();}
  }
  async transaction<T>(work:()=>Promise<T>):Promise<T> {
    let locked=false;
    try {
      if(this.mysql) {const result=await this.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':buffet_write'), 10) AS acquired");assert(Number(result[0]?.acquired)===1,'Banco ocupado. Tente novamente.');locked=true;}
      // Controle de transação usa o protocolo de texto: alguns servidores não preparam START TRANSACTION.
      if(this.mysql) await this.mysql.beginTransaction();else await this.execute('BEGIN IMMEDIATE');
      try {const value=await work();if(this.mysql) await this.mysql.commit();else await this.execute('COMMIT');this.persist();return value;}
      catch(error) {if(this.mysql) await this.mysql.rollback().catch(()=>{});else await this.execute('ROLLBACK').catch(()=>{});throw error;}
    } finally {if(locked) await this.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':buffet_write'))");}
  }
  async migrate(schema:string):Promise<void> {
    await this.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at VARCHAR(30) NOT NULL)');
    if((await this.query('SELECT version FROM schema_migrations WHERE version = 1')).length) {this.persist();return;}
    const statements=schema.replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
    for(let statement of statements) {
      if(this.sqlite) statement=statement.replace(/INT PRIMARY KEY AUTO_INCREMENT/g,'INTEGER PRIMARY KEY AUTOINCREMENT');
      try {await this.execute(statement);} catch(error) {
        const code=(error as {code?:string}).code;
        if(!/^CREATE INDEX/.test(statement)||!(code==='ER_DUP_KEYNAME'||String(error).includes('already exists'))) throw error;
      }
    }
    await this.execute('INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)',[new Date().toISOString()]); this.persist();
  }
  private persist():void {
    if(!this.sqlite||!this.file) return;
    mkdirSync(dirname(this.file),{recursive:true});
    const temporary=this.file+'.tmp';writeFileSync(temporary,this.sqlite.export(),{mode:0o600});renameSync(temporary,this.file);
  }
  async close():Promise<void> {this.persist();this.sqlite?.close();await this.mysql?.end();}
}
