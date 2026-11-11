import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
async function run():Promise<void> {
  for(const folder of ['main','preload','renderer','database']) await mkdir(`dist/${folder}`,{recursive:true});
  await Promise.all([
    build({entryPoints:['src/main/index.ts'],outfile:'dist/main/index.js',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron','mysql2/promise','sql.js','dotenv']}),
    build({entryPoints:['src/preload/index.ts'],outfile:'dist/preload/index.js',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron']}),
    build({entryPoints:['src/renderer/app.ts'],outfile:'dist/renderer/app.js',bundle:true,platform:'browser',target:'chrome140',minify:false}),
    copyFile('src/renderer/index.html','dist/renderer/index.html'),
    copyFile('src/renderer/app.css','dist/renderer/app.css'),
    copyFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'),'dist/renderer/bootstrap.min.css'),
    copyFile('database/001_initial.sql','dist/database/001_initial.sql')
  ]);
  console.log('Aplicação compilada em dist/.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});

