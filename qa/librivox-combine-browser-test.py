"""Browser regression for independent author + reader facets and section-level selection."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parent.parent
html=(root/'librivox-explorer.html').read_text().replace('<link rel="stylesheet" href="./librivox-explorer.css">','<style>'+ (root/'librivox-explorer.css').read_text()+'</style>').replace('<script type="module" src="./librivox-explorer.mjs"></script>','')
files=['librivox-text-locator.mjs','librivox-combine.mjs','librivox-audio-extract.mjs']
source='\n'.join((root/f).read_text().replace('export async function ','async function ').replace('export function ','function ').replace('export const ','const ') for f in files)
js='\n'.join(line for line in (root/'librivox-explorer.mjs').read_text().splitlines() if not line.startswith('import '))
source += "\nasync function saveSound(item){window.savedAudio.push(item);}\n" + js
mac={'id':'macdonald','name':'George MacDonald'};peter={'id':'peter','name':'Peter Yearsley'};alice={'id':'alice','name':'Alice Brown'}
work={'id':'mac-work','title':'MacDonald Test Book','authors':[mac],'language':'English'}
other={'id':'other','title':'Other Writer','authors':[alice],'language':'English'}
macWork={**work,'recordings':[{'id':'pete-100','librivox_id':100,'narrators':[peter],'chapter_count':3},{'id':'alice-200','librivox_id':200,'narrators':[alice],'chapter_count':1}]}
otherWork={**other,'recordings':[{'id':'pete-300','librivox_id':300,'narrators':[peter],'chapter_count':1}]}
def sect(i,title,who):
 return {'id':str(i),'section_number':str(i),'title':title,'playtime':'00:12','listen_url':f'https://archive.org/download/test/{i}.mp3','readers':[{'reader_id':'167' if who==peter else '222','display_name':who['name']}]}
feed100={'books':[{'id':'100','title':'MacDonald Test Book','url_librivox':'https://librivox.org/mac-book/','url_text_source':'https://www.gutenberg.org/ebooks/325','sections':[sect(1,'One',alice),sect(2,'Two',peter),sect(3,'Three',peter)]}]}
feed200={'books':[{'id':'200','title':'MacDonald Test Book, another reader','url_librivox':'https://librivox.org/mac-other/','sections':[sect(4,'Four',alice)]}]}
feed300={'books':[{'id':'300','title':'Unrelated book','url_librivox':'https://librivox.org/other/','sections':[sect(5,'Five',peter)]}]}
# A 101-credit reader tests correct pagination: MacDonald appears only after page one.
credits=[{'work':other,'recording':otherWork['recordings'][0]} for _ in range(100)]+[{'work':work,'recording':macWork['recordings'][0]}]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in ((896,414),(390,844)):
  page=browser.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  data={'people':{'george macdonald':mac,'peter yearsley':peter,'alice brown':alice},'credits':credits,'works':{'mac-work':macWork,'other':otherWork},'feeds':{'100':feed100,'200':feed200,'300':feed300},'authorWorks':[work]}
  page.evaluate('''(data)=>{
   window.fixture=data;const memo={};
   Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return memo[k]||null},setItem(k,v){memo[k]=v;}}});
   window.savedAudio=[];window.calls=[];
   Object.defineProperty(window,'fetch',{configurable:true,writable:true,value:async(url)=>{
     const u=new URL(url),route=u.pathname.replace('/api/v1','');window.calls.push(u.pathname+u.search);
     let response=null;
     if(route==='/people/search'){const query=(u.searchParams.get('q')||'').toLowerCase();response={results:Object.values(window.fixture.people).filter(p=>p.name.toLowerCase().includes(query))};}
     else if(route==='/people/peter/recordings'){
       const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||100);
       response={recordings:window.fixture.credits.slice(offset,offset+limit),total:window.fixture.credits.length,limit,offset};
     }
     else if(route==='/people/macdonald')response={authored:window.fixture.authorWorks,authored_total:1};
     else if(route.startsWith('/works/'))response=window.fixture.works[route.slice('/works/'.length)];
     else if(route==='/librivox/audiobooks')response=window.fixture.feeds[u.searchParams.get('id')];
     if(!response)return new Response('{}',{status:404});
     return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
   }});
  }''',data)
  page.add_script_tag(content=source)
  page.locator('#filter-author').fill('George MacDonald')
  page.locator('#filter-reader').fill('Peter Yearsley')
  page.locator('#find-combined').click()
  page.wait_for_function("document.querySelector('#search-status').textContent.includes('confirmed LibriVox')",timeout=15000)
  assert page.locator('.result-main').count()==1,page.locator('#search-status').inner_text()
  assert page.locator('.result-main').first.inner_text().find('MacDonald Test Book')>=0
  assert '2 matching sections' in page.locator('.result-main').first.inner_text()
  assert page.evaluate("window.calls.some(x=>x.includes('/people/peter/recordings')&&x.includes('offset=100'))"),'must page through reader credits'
  page.locator('.result-main').first.click()
  page.wait_for_function("document.querySelector('#chapter-select').options.length===2")
  assert page.locator('#recording-select option').count()==1,'must exclude other narrator edition'
  assert '2 of 3 sections read by Peter Yearsley' in page.locator('#section-coverage').inner_text()
  opts=page.locator('#chapter-select option').all_inner_texts()
  assert len(opts)==2 and 'Two' in opts[0] and 'Three' in opts[1] and all('One' not in o for o in opts),opts
  page.locator('#reader-info button.person-chip').first.click()
  page.locator('#attribution-row button.person-chip').first.click()
  if page.locator('#back-to-search').is_visible(): page.locator('#back-to-search').click()
  assert page.locator('#favorite-filters button').count()==2,'favorites should be reusable as independent facets'
  page.locator('#combined-clear').click()
  assert page.locator('#filter-author').input_value()=='' and page.locator('#filter-reader').input_value()==''
  page.locator('#test-combined').click()
  page.wait_for_function("document.querySelector('#search-status').textContent.includes('confirmed LibriVox')",timeout=15000)
  assert page.locator('.result-main').count()==1
  dims=page.evaluate('''()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})''')
  assert dims['scroll']<=dims['width']+1,dims
  assert not errors,errors
  print('PASS',width,height,'author+reader AND query, page 2 credits, verified reader sections, favorite facets and reset')
  page.close()
 browser.close()