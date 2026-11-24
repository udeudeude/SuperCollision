/* Shared Sounds + LibriVox design setting. Works with Code's existing
 * localStorage key and optional ?design= URL; never alters Code itself. */
const designs=[
 ['bauhaus','Bauhaus'],
 ['blackmountain','Black Mountain'],
 ['moog','Moog'],
 ['makenoise','Make Noise'],
 ['score','Open Form'],
 ['scope','Oscilloscope'],
 ['patch','Signal Atlas'],
 ['terminal','Control Room']
];
const allowed=new Set(designs.map(([id])=>id));
const KEY='supercollision-theme';
function storedDesign(){
 const fromUrl=new URLSearchParams(location.search).get('design');
 if(fromUrl&&allowed.has(fromUrl))return fromUrl;
 try{
  const stored=localStorage.getItem(KEY);
  if(stored&&allowed.has(stored))return stored;
 }catch{}
 return 'moog';
}
function main(){
 const header=document.querySelector('body>header');
 if(!header)return;
 const surface=header.classList.contains('topbar')?'librivox':'sounds';
 document.body.dataset.scSurface=surface;
 const label=document.createElement('label');
 label.className='sc-design-choice';
 const caption=document.createElement('span');
 caption.textContent='DESIGN';
 const select=document.createElement('select');
 select.id='sc-surface-design';
 select.setAttribute('aria-label','Visual design, shared with main Code page');
 for(const [id,title] of designs){
  const option=document.createElement('option');
  option.value=id;option.textContent=title;select.add(option);
 }
 label.append(caption,select);
 const version=header.querySelector('.preview-note')||header.querySelector(':scope > small');
 if(version){version.classList.add('sc-version');header.insertBefore(label,version)}
 else header.append(label);
 function apply(value,{persist=false}={}){
  if(!allowed.has(value))value='moog';
  document.body.dataset.theme=value;select.value=value;
  if(persist){try{localStorage.setItem(KEY,value)}catch{}}
  const meta=document.querySelector('meta[name="theme-color"]');
  const dark=value==='scope'||value==='makenoise'||value==='moog';
  const background=dark?(value==='scope'?'#06150f':value==='makenoise'?'#0b0b0b':'#211e1a'):
   value==='bauhaus'?'#f0ead9':value==='blackmountain'?'#e7e1ce':
   value==='score'?'#f6f0e0':value==='patch'?'#d9d3c2':'#f4f4f1';
  if(meta)meta.content=background;
  document.documentElement.style.backgroundColor=background;
  document.documentElement.style.colorScheme=dark?'dark':'light';
  window.dispatchEvent(new CustomEvent('sc-surface-design-change',{detail:{design:value,surface}}));
 }
 apply(storedDesign());
 select.addEventListener('change',()=>apply(select.value,{persist:true}));
 window.addEventListener('pageshow',()=>apply(storedDesign()));
 window.addEventListener('storage',e=>{if(e.key===KEY)apply(storedDesign())});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',main,{once:true});
else main();
