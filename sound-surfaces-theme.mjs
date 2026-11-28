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
 // Reuse the exact selector shipped in Code's header. Do not build a
 // competing theme selector or rearrange the header after first paint.
 const select=header.querySelector('#theme-choice');
 if(!select)return;
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
