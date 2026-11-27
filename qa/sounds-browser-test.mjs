/* Legacy Sounds URL is now a bookmark-preserving redirect.
 * The live recorder, library and acquisition workflows are tested in Bench. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.cwd(),'source');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return}
 try{res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path))}
 catch{res.writeHead(404).end('Not Found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.SOUNDS_BROWSER_CHANNEL?{channel:process.env.SOUNDS_BROWSER_CHANNEL}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 const cases=[
  ['', '#details',null],['#library','#details',null],['#create','#play',null],
  ['#generate','#play','generate'],['#record','#sample','record'],
  ['#import','#sample','import'],['#discover','#sample','discover-audio']
 ];
 for(const [legacy,hash,action] of cases){
  await page.goto(base+'/sounds.html?design=moog'+legacy,{waitUntil:'domcontentloaded'});
  await page.waitForURL(url=>url.pathname.endsWith('/sounds-bench-preview.html')&&url.hash===hash);
  assert.equal(new URL(page.url()).searchParams.get('design'),'moog');
  await page.waitForFunction(()=>document.body.dataset.scSurface==='sounds');
  if(action){
   await page.waitForFunction(()=>!document.querySelector('#bench-acquire-overlay')?.hidden);
   assert.equal(new URL(page.url()).searchParams.has('legacy-action'),false);
  }
  assert.equal(await page.locator('.bench-tabs').count(),1);
 }
 // A redirect must never clear or migrate browser-local sound records.
 await page.evaluate(()=>localStorage.setItem('legacy-redirect-sentinel','preserved'));
 await page.goto(base+'/sounds.html#library');
 await page.waitForURL('**/sounds-bench-preview.html#details');
 assert.equal(await page.evaluate(()=>localStorage.getItem('legacy-redirect-sentinel')),'preserved');
 await context.close();
 console.log('Legacy Sounds bookmarks redirect to Instrument Bench without clearing local storage.');
}finally{await browser.close();server.close()}
