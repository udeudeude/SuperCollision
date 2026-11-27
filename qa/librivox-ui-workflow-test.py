from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parent.parent if Path(__file__).resolve().parent.name=='qa' else Path(__file__).resolve().parent
source=(root/'librivox-explorer.html').read_text()
bench_remote=(root/'sounds-bench-remote.mjs').read_text()
bench_acquire=(root/'sounds-bench-acquire.mjs').read_text()
assert 'librivox-explorer.html' in bench_remote and 'bench-open-librivox' in bench_remote, 'Instrument Bench LibriVox discovery missing'
assert 'librivox' in bench_acquire and 'acquire-filter' in bench_acquire, 'Saved LibriVox samples cannot be filtered'
source=re.sub(r'<link[^>]+librivox-explorer\.css[^>]*>', '<style>'+ (root/'librivox-explorer.css').read_text()+'</style>', source)
source=re.sub(r'<script[^>]+librivox-explorer\.mjs[^>]*></script>','',source)
def inline_source(path):
    text=(root/path).read_text()
    return re.sub(r'^export\s+','',re.sub(r'^import[^\n]+\n','',text,flags=re.M),flags=re.M)
helpers='\n'.join(inline_source(path) for path in ['librivox-text-locator.mjs','sounds-store.mjs','librivox-combine.mjs','librivox-audio-extract.mjs'])
app=inline_source('librivox-explorer.mjs')
work={'id':'work-77','title':'At the Back of the North Wind','language':'English','authors':[{'id':'11','name':'George MacDonald'}]}
book={**work,'recordings':[{'id':'edition-1','librivox_id':676,'narrators':[{'id':'167','name':'Peter Yearsley'}],'chapter_count':2},{'id':'edition-2','librivox_id':777,'narrators':[{'id':'44','name':'Meredith Hughes'}],'chapter_count':2}]}
feed={'books':[{'id':'676','title':'At the Back of the North Wind','url_librivox':'https://librivox.org/example','url_text_source':'https://www.gutenberg.org/ebooks/1','sections':[
 {'id':'1','section_number':1,'title':'Chapter 1','playtime':'00:15','listen_url':'https://archive.org/1.mp3','readers':[{'reader_id':'44','display_name':'Meredith Hughes'}]},
 {'id':'2','section_number':2,'title':'Chapter 2','playtime':'00:15','listen_url':'https://archive.org/2.mp3','readers':[{'reader_id':'167','display_name':'Peter Yearsley'}]}]}]}
mock={'/people/search':{'results':[{'id':'11','name':'George MacDonald'},{'id':'167','name':'Peter Yearsley'}]},'/people/167/recordings':{'recordings':[{'work':work,'recording':{'id':'edition-1','narrators':[{'id':'167','name':'Peter Yearsley'}]}}],'total':1},'/works/work-77':book,'/librivox/audiobooks':feed}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(390,844),(414,896),(896,414),(768,640)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=True,is_mobile=True,device_scale_factor=2)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(source)
  page.evaluate('''(mock)=>{window.mockApi=mock; window.fetch=async (url)=>{
    const path=new URL(url).pathname.replace('/api/v1','');
    const data=window.mockApi[path];return new Response(JSON.stringify(data||{}),{status:data?200:404,headers:{'Content-Type':'application/json'}})
  };}''',mock)
  page.add_script_tag(content=helpers+app)
  print('ADDED',width,height,errors,flush=True)
  # Seeing area above, thumb-reachable search below: search stays anchored
  # without pushing the result list outside the phone viewport.
  reach=page.evaluate("""() => {
   const panel=document.querySelector('#discovery-panel').getBoundingClientRect();
   const form=document.querySelector('#combined-form').getBoundingClientRect();
   const results=document.querySelector('#catalog-results').getBoundingClientRect();
   return {panelBottom:panel.bottom,formBottom:form.bottom,formTop:form.top,
    resultsTop:results.top,resultsBottom:results.bottom,resultsHeight:results.height};
  }""")
  assert reach['formBottom'] >= reach['panelBottom'] - 140, ('Search must be near thumb reach',width,height,reach)
  assert reach['resultsTop'] < reach['formTop'] and reach['resultsHeight'] >= 60, ('Results must remain visible above search',width,height,reach)
  assert page.locator('#catalog-disclosure').evaluate('(e)=>!e.open')
  assert page.locator('input#filter-author').evaluate('(e)=>getComputedStyle(e).fontSize')=='16px'
  assert page.locator('input#filter-reader').evaluate('(e)=>getComputedStyle(e).fontSize')=='16px'
  assert page.locator('#active-filters').inner_text()=='No filters selected'
  # A prior unrelated catalog query must not be conflated with the next combined search.
  page.locator('#catalog-disclosure > summary').click()
  page.locator('#catalog-query').fill('Doyle')
  page.locator('input[name="scope"][value="authors"]').check()
  page.locator('#catalog-form button[type="submit"]').click()
  page.wait_for_function("document.querySelector('#search-status').textContent.includes('results shown')",timeout=6000)
  assert page.locator('#catalog-query').input_value()=='Doyle'
  page.locator('#filter-author').fill('George MacDonald')
  page.locator('#filter-reader').fill('Peter Yearsley')
  page.locator('#find-combined').click()
  print('SEARCH CLICK',page.locator('#search-status').inner_text(),flush=True)
  page.wait_for_function('document.querySelector("#catalog-results .result-main strong")?.textContent === "At the Back of the North Wind"',timeout=6000)
  assert 'READER: Peter Yearsley' in page.locator('#active-filters').inner_text()
  assert page.locator('#catalog-disclosure').evaluate('(e)=>!e.open')
  assert page.locator('#catalog-query').input_value()==''
  assert page.locator('#catalog-results .result-main').count()==1
  page.locator('#catalog-results .result-main').click()
  page.wait_for_function('document.querySelector("#section-coverage")?.textContent.includes("1 of 2")',timeout=6000)
  assert page.locator('#chapter-audio').get_attribute('src') is None, 'Selecting a chapter cannot fetch audio'
  assert page.locator('#chapter-audio').is_hidden()
  assert page.locator('#load-chapter-audio').is_visible()
  assert page.locator('#set-start').is_disabled()
  page.locator('#load-chapter-audio').click()
  assert page.locator('#chapter-audio').get_attribute('src') is None, 'Unknown network requires consent'
  assert 'Streaming blocked' in page.locator('#playback-status').inner_text()
  page.locator('#permit-preview-stream').check()
  page.locator('#load-chapter-audio').click()
  assert page.locator('#chapter-audio').get_attribute('src')=='https://archive.org/2.mp3'
  assert page.locator('#load-chapter-audio').is_hidden()
  page.locator('#permit-preview-stream').uncheck()
  assert page.locator('#chapter-audio').get_attribute('src') is None, 'Revoked permission must unload audio'
  assert page.locator('#load-chapter-audio').is_visible()
  assert page.locator('#chapter-select option').count()==1
  assert 'Peter Yearsley' in page.locator('#work-context').inner_text()
  assert 'Chapter 2' in page.locator('#chapter-select option').first.inner_text()
  assert page.locator('#sample-editor').evaluate('(e)=>!e.open')
  assert page.locator('#mark-position').is_hidden()
  # Expand the audio extraction stage only when needed.
  page.locator('#sample-editor > summary').click()
  assert page.locator('#set-start').is_visible()
  assert page.locator('#extract-wav').is_visible()
  dims=page.evaluate('''()=>({doc:document.documentElement.scrollWidth,inner:innerWidth,work:document.querySelector('#work-panel').scrollWidth,body:document.querySelector('#work-panel').clientWidth})''')
  assert dims['doc']<=dims['inner']+1,dims
  assert dims['work']<=dims['body']+1,dims
  assert not errors,errors
  print('PASS',width,height,'author+reader filters, right sections, sample stage, no overflow')
  page.close()
 browser.close()