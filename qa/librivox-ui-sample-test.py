from pathlib import Path
from playwright.sync_api import sync_playwright
import re,wave,struct,math
root=Path(__file__).resolve().parent.parent if Path(__file__).resolve().parent.name=='qa' else Path(__file__).resolve().parent
src=(root/'librivox-explorer.html').read_text()
src=re.sub(r'<link[^>]+librivox-explorer\.css[^>]*>', '<style>'+ (root/'librivox-explorer.css').read_text()+'</style>', src)
src=re.sub(r'<script[^>]+librivox-explorer\.mjs[^>]*></script>','',src)
def inline_source(path):
    text=(root/path).read_text()
    return re.sub(r'^export\s+','',re.sub(r'^import[^\n]+\n','',text,flags=re.M),flags=re.M)
shared='\n'.join(inline_source(path) for path in ['librivox-text-locator.mjs','sounds-store.mjs','librivox-combine.mjs','librivox-audio-extract.mjs'])
app=inline_source('librivox-explorer.mjs')
p=root/'qa/sample-3s.wav';p.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(p),'wb') as wav:
 wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(22050);wav.writeframes(b''.join(struct.pack('<h',int(math.sin(2*math.pi*220*t/22050)*8000)) for t in range(66150)))
work={'id':'w','title':'MacDonald Short Story','language':'English','authors':[{'id':'11','name':'George MacDonald'}]}
book={**work,'recordings':[{'id':'edition','librivox_id':42,'narrators':[{'id':'167','name':'Peter Yearsley'}],'chapter_count':1}]}
feed={'books':[{'id':'42','url_librivox':'https://librivox.org/a','url_text_source':'https://www.gutenberg.org/ebooks/123','sections':[{'id':'1','section_number':1,'title':'Part One','listen_url':'https://archive.org/a.mp3','readers':[{'reader_id':'167','display_name':'Peter Yearsley'}],'playtime':'0:03'}]}]}
mock={'/people/search':{'results':[{'id':'11','name':'George MacDonald'},{'id':'167','name':'Peter Yearsley'}]},'/people/167/recordings':{'total':1,'recordings':[{'work':work,'recording':{'id':'edition','narrators':[{'id':'167','name':'Peter Yearsley'}]}}]},'/works/w':book,'/librivox/audiobooks':feed}
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':414,'height':896},has_touch=True,accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(src)
 page.evaluate('''(x)=>{window.saved=[];const orig=window.fetch;window.fetch=async url=>{const p=new URL(url).pathname.replace('/api/v1','');return new Response(JSON.stringify(window.mock[p]||{}),{status:window.mock[p]?200:404,headers:{'Content-Type':'application/json'}})}}''') if False else None
 page.evaluate('''data=>{window.mock=data;window.fetch=async url=>{const p=new URL(url).pathname.replace('/api/v1','');return new Response(JSON.stringify(window.mock[p]||{}),{status:window.mock[p]?200:404,headers:{'Content-Type':'application/json'}})}}''',mock)
 # Intercept local persistence to verify the actual playable Blob.
 js=re.sub(r'async function saveSound\(item\)\{[\s\S]*?\n\}', 'async function saveSound(item){window.savedSample=item;}', shared, count=1)+app
 page.add_script_tag(content=js)
 page.locator('#filter-author').fill('George MacDonald');page.locator('#filter-reader').fill('Peter Yearsley');page.locator('#find-combined').click()
 page.wait_for_function("document.querySelector('#catalog-results .result-main')",timeout=7000)
 page.locator('#catalog-results .result-main').click()
 page.wait_for_function("document.querySelector('#chapter-select').options.length===1",timeout=7000)
 page.locator('#sample-editor > summary').click()
 page.locator('#sample-audio-file').set_input_files(str(p))
 page.wait_for_function("document.querySelector('#chapter-audio').readyState>=1",timeout=8000)
 page.evaluate("document.querySelector('#chapter-audio').currentTime=0.4")
 page.locator('#set-start').click()
 page.evaluate("document.querySelector('#chapter-audio').currentTime=1.7")
 page.locator('#set-end').click()
 page.locator('#extract-wav').click()
 page.wait_for_function('document.querySelector("#download-wav").disabled===false',timeout=10000)
 info=page.evaluate('''async()=>({size:window.savedSample.blob.size,type:window.savedSample.blob.type,src:window.savedSample.source,name:window.savedSample.name,magic: String.fromCharCode(...new Uint8Array(await window.savedSample.blob.arrayBuffer()).slice(0,4))})''')
 print('EXTRACTION',info,'status',page.locator('#extract-status').inner_text())
 assert info['magic']=='RIFF' and info['type']=='audio/wav' and info['src']=='librivox'
 with page.expect_download(timeout=5000) as download:page.locator('#download-wav').click()
 assert download.value.suggested_filename.endswith('.wav')
 assert not errors,errors
 print('PASS sample extraction and download')
 b.close()