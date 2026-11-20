/* Browser regression for the Sounds-only workspace, without the SuperCollider runtime. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.cwd(),'source');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const file=await readFile(path);res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.end(file)}
 catch{res.writeHead(404);res.end('Not Found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.SOUNDS_BROWSER_CHANNEL?{channel:process.env.SOUNDS_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 const track={stop(){},addEventListener(){}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}});
 window.MediaRecorder=class{
  static isTypeSupported(){return true}
  constructor(){this.state='inactive';this.mimeType='audio/webm'}
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['demo'],{type:'audio/webm'})});queueMicrotask(()=>this.onstop?.())}
 };
});
const resultBody={result_count:5,page_count:1,results:[
 {id:'one',title:'Allowed BY',creator:'Maker One',license:'by',source:'wikimedia',url:'https://audio.example.test/by.wav',foreign_landing_url:'https://example.test/by',duration:4000},
 {id:'two',title:'Free CC0',creator:'Maker Two',license:'cc0',source:'wikimedia',url:'https://audio.example.test/cc0.wav',foreign_landing_url:'https://example.test/cc0',duration:3000},
 {id:'three',title:'NonCommercial',creator:'Maker Three',license:'by-nc',source:'wikimedia',url:'https://audio.example.test/nc.wav'},
 {id:'four',title:'NoDerivatives',creator:'Maker Four',license:'by-nd',source:'wikimedia',url:'https://audio.example.test/nd.wav'},
 {id:'five',title:'Unknown',creator:'Maker Five',license:'not a license',source:'wikimedia',url:'https://audio.example.test/unknown.wav'}
]};
let downloadCount=0,queryCount=0,commonsCount=0,freesoundQueries=0,freesoundFilter='';
await page.route('https://api.openverse.org/v1/audio/**',async route=>{
 queryCount++;
 if(new URL(route.request().url()).searchParams.get('source')==='wikimedia_audio')commonsCount++;
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(resultBody)})});
await page.route('https://freesound.org/apiv2/search/**',async route=>{
 freesoundQueries++;
 const request=route.request();
 freesoundFilter=new URL(request.url()).searchParams.get('filter')||'';
 assert.equal(request.headers().authorization,'Token test-freesound-key');
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
  count:2,next:null,results:[{id:23,name:'Freesound bell',username:'Sound Maker',
   duration:2.5,license:'http://creativecommons.org/publicdomain/zero/1.0/',
   previews:{'preview-hq-mp3':'https://audio.example.test/bell.mp3'}},
   {id:24,name:'Freesound BY',username:'Another Maker',duration:3.2,
    license:'https://creativecommons.org/licenses/by/4.0/',
    previews:{'preview-hq-mp3':'https://audio.example.test/by-preview.mp3'}}]
 })});
});
await page.route('https://audio.example.test/**',async route=>{downloadCount++;await route.fulfill({status:200,contentType:'audio/wav',headers:{'access-control-allow-origin':'*'},body:Buffer.from('RIFFdemo')})});
try{
 await page.goto(base+'/sounds.html');
 assert.equal(await page.locator('#sounds-tabs button').count(),6);
 assert.equal(await page.locator('.sounds-library-nav [data-view="library"]').count(),1,'library must be its own primary destination');
 assert.deepEqual(await page.locator('.sounds-acquire-buttons [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view)),['create','generate','import','record','discover'],'five acquisitions must be grouped separately from Library');
 assert.equal(await page.locator('#sounds-library').isVisible(),true);
 assert.equal(await page.locator('#discover-cancel-download').isHidden(),true,'cancel download is hidden while idle');
 await page.getByRole('tab',{name:'Create'}).click();
 await page.locator('#sounds-source-name').fill('Example instrument');
 await page.locator('#sounds-source').fill('SynthDef(\\tone,{Out.ar(0,SinOsc.ar(220)*0.1)}).add;');
 await page.locator('#sounds-save-source').click();
 await page.getByRole('tab',{name:'Library'}).click();
 await page.getByText('Example instrument').first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),1,'code item should not crash old audio renderer');
 await page.getByRole('button',{name:'★ Favorite'}).count().then(n=>assert.equal(n,0));
 await page.getByRole('button',{name:'☆ Favorite'}).click();
 await page.getByRole('button',{name:'★ Favorite'}).waitFor();
 await page.locator('#sounds-filter').selectOption('favorite');
 assert.equal(await page.locator('.managed-item').count(),1);
 await page.locator('#sounds-filter').selectOption('all');
 await page.getByRole('tab',{name:'Record'}).click();
 await page.locator('#mic-ready').check();
 await page.getByText('Microphone ready.',{exact:false}).waitFor();
 await page.locator('#start').dispatchEvent('pointerdown',{pointerId:1,button:0,isPrimary:true});
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-recording')),true);
 await page.locator('#start').dispatchEvent('pointerup',{pointerId:1,button:0,isPrimary:true});
 await page.getByText('Saved recording locally',{exact:false}).waitFor();
 await page.getByRole('tab',{name:'Library'}).click();
 await page.getByText('Recording',{exact:false}).first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),2);
 await page.getByRole('tab',{name:'Discover'}).click();
 await page.locator('#discover-query').fill('bells');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Allowed BY').waitFor();
 assert.equal(await page.locator('.discovered-sound').count(),2,'default filters must exclude NC/ND/unknown');
 assert.match(await page.locator('.discovered-sound').first().textContent(),/4 s/, 'Openverse milliseconds must display as seconds');
 assert.equal(await page.locator('.discovered-sound audio[src]').count(),0,'Discover must not fetch previews before network permission');
 await page.getByRole('button',{name:'Load preview (network)'}).first().click();
 assert.equal(await page.locator('.discovered-sound audio[src]').count(),0,'unknown network may not start a preview');
 const button=page.getByRole('button',{name:'Save available audio'}).first();
 await button.click();
 assert.equal(downloadCount,0,'network override must be opt-in');
 await page.locator('#discover-allow-unverified').check();
 await button.click();
 await page.getByText('Saved Allowed BY locally.',{exact:false}).waitFor();
 assert.equal(downloadCount,1);
 assert.equal(await page.locator('#discover-cancel-download').isHidden(),true,'completed download releases cancel control');
 await page.locator('#discover-cc0').check();
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Free CC0').waitFor();
 assert.equal(await page.locator('.discovered-sound').count(),1,'CC0 preset must be enforced');
 // HTTP success and an audio content type must not permit an HTML error to enter the library.
 await page.route('https://audio.example.test/cc0.wav',route=>route.fulfill({
  status:200,contentType:'audio/wav',body:'<html>Remote access denied'
 }),{times:1});
 await page.getByRole('button',{name:'Save available audio'}).first().click();
 await page.getByText('The server returned an error page',{exact:false}).waitFor();
 await page.evaluate(()=>{
  const original=window.fetch.bind(window);
  window.__soundsCancelStarted=false;window.__soundsCancelCount=0;
  window.fetch=(url,options={})=>{
   if(String(url).includes('/cc0.wav')){
    window.__soundsCancelStarted=true;
    return new Promise((_,reject)=>{
     options.signal?.addEventListener('abort',()=>{
      window.__soundsCancelCount++;
      reject(new DOMException('Cancelled by user','AbortError'));
     },{once:true});
    });
   }
   return original(url,options);
  };
 });
 await page.getByRole('button',{name:'Save available audio'}).first().click();
 await page.waitForFunction(()=>window.__soundsCancelStarted===true);
 await page.locator('#discover-cancel-download').click();
 await page.waitForFunction(()=>window.__soundsCancelCount===1);
 await page.locator('#discover-cancel-download').waitFor({state:'hidden'});
 assert.equal(downloadCount,1,'cancelled download must not transfer extra audio');
 // Revoking the unknown-network override must stop even a stalled fetch immediately.
 await page.getByRole('button',{name:'Save available audio'}).first().click();
 await page.locator('#discover-cancel-download').waitFor({state:'visible'});
 await page.locator('#discover-allow-unverified').uncheck();
 await page.waitForFunction(()=>window.__soundsCancelCount===2);
 await page.locator('#discover-cancel-download').waitFor({state:'hidden'});
 await page.getByRole('tab',{name:'Library'}).click();
 assert.equal(await page.locator('.managed-item').count(),3,'cancelled download must not alter saved library');
 await page.getByRole('tab',{name:'Discover'}).click();
 await page.locator('#discover-no-attribution').check();
 assert.equal(await page.locator('.discovered-sound').count(),0,'changing license filters must clear stale results');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Free CC0').waitFor();
 await page.locator('#discover-source').selectOption('wikimedia');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Free CC0').waitFor();
 assert.equal(commonsCount,1,'Wikimedia searches must use Openverse source wikimedia_audio');
 await page.locator('#discover-source').selectOption('freesound');
 await page.locator('#discover-key').fill('test-freesound-key');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Freesound bell').waitFor();
 assert.equal(freesoundQueries,1);
 assert.equal(freesoundFilter,'license:"Creative Commons 0"','Freesound should filter at provider, not merely discard results locally');
 assert.equal(await page.locator('.discovered-sound').count(),1,'CC0/no-attribution filters must work with Freesound URL licenses');
 assert.match(await page.locator('.discovered-sound').first().textContent(),/3 s/,'Freesound durations are in seconds');
 assert.match(await page.locator('.discovered-sound').first().textContent(),/Creative Commons Zero.*1.0/);
 assert.equal(await page.locator('.discovered-sound a').filter({hasText:'License terms'}).first().getAttribute('href'),'https://creativecommons.org/publicdomain/zero/1.0/');
 await page.locator('#discover-no-attribution').uncheck();
 await page.locator('#discover-cc0').uncheck();
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Freesound BY').waitFor();
 assert.equal(await page.locator('.discovered-sound').count(),2,'BY and CC0 URLs must pass the combined default commercial/remix filters');
 assert.equal(await page.locator('.discovered-sound').filter({hasText:'Freesound BY'}).locator('a').filter({hasText:'License terms'}).getAttribute('href'),'https://creativecommons.org/licenses/by/4.0/');
 assert.equal(await page.locator('.discovered-sound audio[src]').count(),0,'previews stay unloaded after searching');
 await page.locator('#discover-allow-unverified').check();
 await page.getByRole('button',{name:'Load preview (network)'}).first().click();
 assert.equal(await page.locator('.discovered-sound audio[src]').count(),1,'explicit network permission can load a preview');
 await page.locator('#discover-allow-unverified').uncheck();
 assert.equal(await page.locator('.discovered-sound audio[src]').count(),0,'revoking permission releases loaded previews');
 assert.equal(await page.getByRole('button',{name:'Load preview (network)'}).first().isVisible(),true);
 await page.getByRole('tab',{name:'Library'}).click();
 assert.equal(await page.locator('.managed-item').count(),3);
 assert.equal(await page.getByText('Creative Commons BY',{exact:false}).count()>0,true,'license must be retained');
 const instrumentRow=page.locator('.managed-item').filter({hasText:'Example instrument'});
 const sourceDownloadPromise=page.waitForEvent('download');
 await instrumentRow.getByRole('button',{name:'Export .scd'}).click();
 const sourceDownload=await sourceDownloadPromise;
 assert.match(sourceDownload.suggestedFilename(),/\.scd$/);
 assert.match(await readFile(await sourceDownload.path(),'utf-8'),/SynthDef/,'source export must be unmodified');
 const backupDownloadPromise=page.waitForEvent('download');
 await page.locator('#sounds-backup-export').click();
 const backupDownload=await backupDownloadPromise;
 assert.match(backupDownload.suggestedFilename(),/\.scsounds$/);
 const backupBytes=await readFile(await backupDownload.path());
 assert.ok(backupBytes.byteLength>200,'complete library backup should contain audio and code');
 page.once('dialog',dialog=>dialog.accept());
 await instrumentRow.getByRole('button',{name:'Delete'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.managed-item').length===2);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#sounds-backup-import').setInputFiles({name:'recovery.scsounds',mimeType:'application/octet-stream',buffer:backupBytes});
 await page.getByText('Restored 1 sounds.',{exact:false}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.managed-item').length===3);
 assert.equal(await page.getByText('Example instrument').count()>0,true,'code item should return');
 await page.locator('#sounds-backup-import').setInputFiles({name:'recovery.scsounds',mimeType:'application/octet-stream',buffer:backupBytes});
 await page.getByText('Nothing to restore: all 3 sounds already exist.',{exact:false}).waitFor();
 assert.equal(await page.locator('.managed-item').count(),3,'restore must not duplicate records');
 await page.reload();
 await page.locator('.managed-item').first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),3,'IndexedDB should persist across reload');
 assert.equal(queryCount>=2,true);
 await page.goto(base+'/sounds-lab.html');
 assert.equal(await page.locator('#lab-source-bay').count(),1,'the SuperCollider source bay must be permanently present');
 assert.equal(await page.locator('#lab-live-source').isEditable(),false,'only native-loaded instruments have editable code');
 assert.equal(await page.locator('#lab-sync-label').textContent(),'NO SOURCE');
 assert.equal(await page.locator('#lab-source-bay').evaluate(bay=>
   Boolean(bay.compareDocumentPosition(document.querySelector('#lab-waveform'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,
   'source must be above the reachable waveform and controls');
 assert.equal(await page.locator('#lab-source-bay').evaluate(bay=>getComputedStyle(bay).position),'sticky',
  'source should stay visible at top while thumb controls remain reachable below');
 assert.ok(await page.locator('#lab-live-source').evaluate(field=>parseFloat(getComputedStyle(field).fontSize)>=16),
  'iPhone code editor should avoid focus zoom at small type sizes');
 await page.locator('#lab-sound option').nth(1).waitFor({state:'attached'});
 assert.ok(await page.locator('#lab-sound option').count()>=3,'laboratory should see original local audio items');
 assert.equal(await page.locator('#lab-load').isDisabled(),true,'native transfer must wait for engine startup');
 assert.equal(await page.locator('#lab-play').isDisabled(),true,'playback must wait for native sample transfer');
 assert.equal(await page.locator('#lab-waveform').count(),1);
 assert.ok(await page.locator('#lab-waveform').evaluate(canvas=>canvas.width>0&&canvas.height>0),'waveform placeholder must render before engine startup');
 await page.locator('#lab-start').evaluate(input=>{input.value='90';input.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#lab-finish').evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}))});
 assert.equal(await page.locator('#lab-start').inputValue(),'49','region sliders should preserve an ordered, nonempty selection');
 assert.match(await page.locator('#lab-region-summary').textContent(),/Region: 49% to 50%/);

 const linkedAudioId=await page.evaluate(async()=>{
  const {allSounds,saveSound}=await import('/sounds-store.mjs');
  const audio=(await allSounds()).find(item=>item.blob instanceof Blob);
  await saveSound({id:'linked-instrument-preset',name:'Reusable sample instrument',source:'preset',
   created:Date.now(),favorite:false,code:'// native sample instrument',
   preset:{soundId:audio.id,channels:1,start:0.2,finish:0.8,rate:0.75,amp:0.12,loop:true}});
  await saveSound({id:'missing-audio-preset',name:'Missing sample preset',source:'preset',
   created:Date.now(),favorite:false,code:'// referenced original was deleted',
   preset:{soundId:'deleted-original',channels:1,start:0.25,finish:0.75,rate:1,amp:0.1,loop:false}});
  return audio.id;
 });
 await page.goto(base+'/sounds.html');
 const presetRow=page.locator('.managed-item').filter({hasText:'Reusable sample instrument'});
 await presetRow.waitFor();
 assert.match(await presetRow.textContent(),/source audio available/i);
 await page.locator('#sounds-filter').selectOption('preset');
 await page.waitForFunction(()=>document.querySelectorAll('.managed-item').length===2);
 assert.equal(await page.locator('.managed-item').count(),2,'presets need a dedicated Library filter');
 const link=await presetRow.getByRole('link',{name:'Open preset in Sample Lab'}).getAttribute('href');
 assert.equal(link,'./sounds-lab.html?preset=linked-instrument-preset');
 await page.goto(base+'/sounds-lab.html?preset=linked-instrument-preset');
 await page.waitForFunction(()=>document.querySelector('#lab-sound')?.value!==''&&document.querySelector('#lab-start')?.value==='20');
 assert.equal(await page.locator('#lab-sound').inputValue(),linkedAudioId,'preset must resolve the original by immutable identifier');
 assert.equal(await page.locator('#lab-finish').inputValue(),'80');
 assert.equal(await page.locator('#lab-rate').inputValue(),'0.75');
 assert.equal(await page.locator('#lab-amp').inputValue(),'0.12');
 assert.equal(await page.locator('#lab-loop').isChecked(),true);
 assert.equal(await page.locator('#lab-play').isDisabled(),true,'linked presets must still require verified native transfer');
 await page.evaluate(async soundId=>{
  const {saveSound}=await import('/sounds-store.mjs');
  await saveSound({id:'precise-linked-preset',name:'Precise sample instrument',source:'preset',
   created:Date.now(),favorite:false,preset:{soundId,channels:1,start:0.231,finish:0.789,rate:0.75,amp:0.12,loop:true}});
  await saveSound({id:'malformed-linked-preset',name:'Malformed preset',source:'preset',
   created:Date.now(),favorite:false,preset:{soundId,channels:1,start:0.95,finish:0.3,rate:1,amp:0.12,loop:false}});
 },linkedAudioId);
 await page.goto(base+'/sounds-lab.html?preset=precise-linked-preset');
 await page.waitForFunction(()=>document.querySelector('#lab-start')?.value==='23.1');
 assert.equal(await page.locator('#lab-finish').inputValue(),'78.9','region precision must survive reopening');
 assert.equal(await page.locator('#lab-play').isDisabled(),true,'preset must not autoplay');
 await page.goto(base+'/sounds-lab.html?preset=malformed-linked-preset');
 await page.getByText('Preset invalid:',{exact:false}).waitFor();
 assert.equal(await page.locator('#lab-sound').inputValue(),'','invalid region may not select audio');
 await page.goto(base+'/sounds-lab.html?preset=missing-audio-preset');
 await page.getByText('Preset unavailable:',{exact:false}).waitFor();
 assert.equal(await page.locator('#lab-sound').inputValue(),'','missing original may not be replaced by arbitrary other audio');
 // Openverse also indexes Freesound previews, which are not original masters.
 resultBody.results=[{id:'indexed-preview',title:'Indexed Freesound clip',creator:'Maker Three',
  creator_url:'https://freesound.org/people/makerthree/',provider:'freesound',source:'freesound',
  license:'by',license_version:'4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',
  attribution:'"Indexed Freesound clip" by Maker Three, CC BY 4.0',
  foreign_landing_url:'https://freesound.org/people/makerthree/sounds/123/',
  url:'https://audio.example.test/indexed-preview.mp3',duration:8500}];
 resultBody.result_count=1;
 await page.goto(base+'/sounds.html');
 await page.getByRole('tab',{name:'Discover'}).click();
 await page.locator('#discover-query').fill('indexed freesound');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Indexed Freesound clip').waitFor();
 assert.match(await page.locator('.discovered-sound').first().textContent(),/compressed preview/);
 assert.equal(await page.getByRole('button',{name:'Save available audio'}).count(),0);
 await page.locator('#discover-allow-unverified').check();
 await page.getByRole('button',{name:'Save compressed preview'}).click();
 await page.getByText('Saved Indexed Freesound clip locally.',{exact:false}).waitFor();
 const indexed=await page.evaluate(async()=>{
  const {allSounds}=await import('/sounds-store.mjs');
  return (await allSounds()).find(item=>item.name==='Indexed Freesound clip')?.origin;
 });
 assert.equal(indexed.variant,'compressed preview');
 assert.equal(indexed.provider,'freesound');
 assert.equal(indexed.creatorUrl,'https://freesound.org/people/makerthree/');
 assert.equal(indexed.licenseVersion,'4.0');
 assert.equal(indexed.attribution,'"Indexed Freesound clip" by Maker Three, CC BY 4.0');
 await page.getByRole('tab',{name:'Library'}).click();
 const importedRow=page.locator('.managed-item').filter({hasText:'Indexed Freesound clip'});
 await importedRow.waitFor();
 assert.match(await importedRow.textContent(),/compressed preview/);
 assert.equal(await importedRow.getByRole('link',{name:'Creator profile'}).getAttribute('href'),indexed.creatorUrl);
 assert.deepEqual(errors,[],'No unhandled page errors allowed');
 console.log('Sounds browser regression passed: library, source, recording, discovery, license filters and persistence');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
