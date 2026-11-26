import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entityNames} from '../src/shared/models';
import {presentationChapters} from '../src/renderer/presentation-data';

test('o roteiro do administrador inclui todos os cadastros e as funcionalidades complementares',()=>{
  const chapters=presentationChapters(()=>true);
  assert.deepEqual(chapters.flatMap(chapter=>chapter.entity?[chapter.entity]:[]).sort(),[...entityNames].sort());
  assert.equal(new Set(chapters.map(chapter=>chapter.id)).size,chapters.length);
  for(const id of ['dashboard','integrations','proposal','payments','email','technical'])assert.ok(chapters.some(chapter=>chapter.id===id));
});

test('o roteiro respeita as permissões de leitura da conta',()=>{
  const allowed=new Set(['events','menus','menu_items','suppliers']);
  const chapters=presentationChapters(entity=>allowed.has(entity));
  assert.ok(chapters.every(chapter=>!chapter.entity||allowed.has(chapter.entity)));
  for(const id of ['users','quotes','installments','proposal','payments','email','technical'])assert.ok(!chapters.some(chapter=>chapter.id===id));
  assert.ok(chapters.some(chapter=>chapter.id==='integrations'));
});
