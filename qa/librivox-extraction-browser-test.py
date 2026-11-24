"""No-navigation Chromium smoke test for the real LibriVox sample export UI."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,base64,subprocess,shutil
root=Path(__file__).resolve().parent.parent
html=(root/'librivox-explorer.html').read_text().replace('<link rel="stylesheet" href="./librivox-explorer.css">', '<style>'+ (root/'librivox-explorer.css').read_text()+'</style>').replace('<script type="module" src="./librivox-explorer.mjs"></script>','')
js=(root/'librivox-explorer.mjs').read_text();text=(root/'librivox-text-locator.mjs').read_text();audio_source=(root/'librivox-audio-extract.mjs').read_text();combo_source=(root/'librivox-combine.mjs').read_text()
assert "import {saveSound}" in js
js='\n'.join(line for line in js.split('\n') if not line.startswith('import '))
text=text.replace('export function','function')
combo_source=combo_source.replace('export function','function')
audio_source=audio_source.replace('export const','const').replace('export async function','async function').replace('export function','function')
full_js=text+'\n'+combo_source+'\n'+audio_source+'\n'+'''async function saveSound(item){window.savedAudio.push(item); if(window.failSave)throw Error('Storage quota');}'''+js
book={'id':'phantastes','title':'Phantastes','authors':[{'id':'george-macdonald','name':'George MacDonald'}], 'language':'English'}
work={**book,'recordings':[{'id':'librivox-1','librivox_id':321,'narrators':[{'id':167,'name':'Peter Yearsley'}], 'chapter_count':2}]}
feed={'books':[{'id':'321','title':'Phantastes','url_librivox':'https://librivox.org/phantastes-by-george-macdonald/', 'url_text_source':'https://www.gutenberg.org/ebooks/325', 'sections':[{'id':'12','section_number':'1','title':'Chapter One','playtime':'00:12','listen_url':'https://archive.org/download/phantastes/01.mp3','readers':[{'reader_id':'167','display_name':'Peter Yearsley'}]},{'id':'13','section_number':'2','title':'Chapter Two','playtime':'00:12','listen_url':'https://archive.org/download/phantastes/02.mp3','readers':[{'reader_id':'167','display_name':'Peter Yearsley'}]}]}]}
mock_records={ '/works/search':{'results':[book]},'/people/search':{'results':[{'id':'167','name':'Peter Yearsley'}]},'/people/167/recordings':{'recordings':[{'work':book,'recording':work['recordings'][0]}],'total':1},'/works/phantastes':work,'/librivox/audiobooks':feed}
fixture=root/'qa/sample-12s.mp3'
if not fixture.is_file():
 if not shutil.which('ffmpeg'): raise SystemExit('ffmpeg is required to generate the real MP3 test fixture')
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=400:duration=12','-ac','1','-ar','44100','-b:a','64k',str(fixture),'-y'],check=True)
mp3base64=base64.b64encode(fixture.read_bytes()).decode()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for width,height in [(896,414),(390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height},accept_downloads=True)
  page.route('https://archive.org/**',lambda route:route.fulfill(status=200,body=fixture.read_bytes(),headers={'Content-Type':'audio/mpeg'}))
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content(html)
  page.evaluate('''(data) => {
    const memo={};window.savedAudio=[];window.remoteDownloadCount=0;
    Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return memo[k]||null;},setItem(k,v){memo[k]=v;}}});
    Object.defineProperty(window,'fetch',{configurable:true,writable:true,value:async (url) => {
      const u=new URL(url);if(u.host==='meta.audiosilo.app'){
        const data=window.mockRecords[u.pathname.replace('/api/v1','')];
        return new Response(JSON.stringify(data||{}),{status:data?200:404,headers:{'Content-Type':'application/json'}});
      }
      if(u.host==='archive.org'){
        window.remoteDownloadCount++;
        const bytes=Uint8Array.from(atob(window.mp3fixture),ch=>ch.charCodeAt(0));
        return new Response(bytes,{status:200,headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)}});
      }
      throw Error('Unexpected fetch '+url);
    }});
  }''')
  page.evaluate('(data)=>{window.mockRecords=data.records;window.mp3fixture=data.fixture}',{'records':mock_records,'fixture':mp3base64})
  page.add_script_tag(content=full_js)
  # Reader quick searches live inside the collapsed advanced catalog section.
  page.locator('#catalog-disclosure > summary').click()
  page.locator('[data-quick="Peter Yearsley"]').click()
  page.wait_for_function("document.querySelector('.result-main strong')?.textContent === 'Peter Yearsley'")
  page.locator('.result-main').first.click()
  page.wait_for_function("document.querySelector('.result-main strong')?.textContent === 'Phantastes'")
  page.locator('.result-main').first.click()
  page.wait_for_function("document.querySelector('#chapter-select').options.length === 2")
  assert page.locator('#extract-wav').is_disabled()
  page.locator('#sample-editor > summary').click()  # The extraction stage is intentionally collapsed until needed.
  page.locator('#sample-audio-file').set_input_files(str(root/'qa/sample-12s.mp3'))
  page.wait_for_function('document.querySelector("#chapter-audio").readyState>=1')
  page.evaluate('document.querySelector("#chapter-audio").currentTime=3')
  page.locator('#set-start').click()
  page.evaluate('document.querySelector("#chapter-audio").currentTime=4.5')
  page.locator('#set-end').click()
  assert page.locator('#extract-wav').is_enabled()
  page.locator('#extract-wav').click()
  try: page.wait_for_function('window.savedAudio.length === 1',timeout=9000)
  except Exception:
   print('DEBUG',page.locator('#extract-status').inner_text(),page.locator('#clip-message').inner_text(),page.evaluate('window.savedAudio.length'),errors)
   raise
  assert page.locator('#download-wav').is_enabled()
  assert page.locator('#extracted-audio').is_visible()
  info=page.evaluate('''async()=>{
    const r=window.savedAudio[0],bytes=new DataView(await r.blob.arrayBuffer());
    return {mime:r.blob.type,size:r.blob.size,header:String.fromCharCode(...new Uint8Array(bytes.buffer,0,4)),source:r.source,name:r.name,
      seconds:(r.blob.size-44)/(bytes.getUint32(24,true)*bytes.getUint16(22,true)*2),remote:window.remoteDownloadCount};
  }''')
  assert info['mime']=='audio/wav' and info['header']=='RIFF' and 1.45<info['seconds']<1.55,info
  assert info['source']=='librivox' and info['remote']==0,info
  with page.expect_download(timeout=10000) as download_info:page.locator('#download-wav').click()
  filename=download_info.value.suggested_filename
  assert filename.endswith('.wav'),filename
  # New selection must invalidate previous download, rather than exporting stale audio.
  page.locator('#chapter-select').select_option('1')
  page.locator('#sample-editor > summary').click()  # Chapter change resets the extraction stage.
  assert page.locator('#chapter-audio').get_attribute('src') is None
  page.locator('#permit-preview-stream').check()
  page.locator('#load-chapter-audio').click()
  assert page.locator('#chapter-audio').get_attribute('src')=='https://archive.org/download/phantastes/02.mp3'
  assert page.locator('#download-wav').is_disabled()
  page.wait_for_function('document.querySelector("#chapter-audio").readyState>=1',timeout=9000)
  page.evaluate('document.querySelector("#chapter-audio").currentTime=1')
  page.locator('#set-start').click()
  page.evaluate('document.querySelector("#chapter-audio").currentTime=2')
  page.locator('#set-end').click()
  page.locator('#extract-wav').click()
  assert 'Full-chapter transfer not approved' in page.locator('#extract-status').inner_text()
  assert page.evaluate('window.remoteDownloadCount')==0
  page.locator('#permit-audio-download').check()
  page.locator('#extract-wav').click()
  page.wait_for_function('window.savedAudio.length === 2',timeout=20000)
  assert page.evaluate('window.remoteDownloadCount')==1
  assert 'Saved' in page.locator('#extract-status').inner_text()
  dims=page.evaluate('''()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth})''')
  assert dims['scrollWidth']<=dims['clientWidth']+1,dims
  assert not errors,errors
  print('PASS',width,height,'WAV saved in Sounds, playable, downloaded, safe network opt-in, switching chapter',info['size'])
  page.close()
 browser.close()