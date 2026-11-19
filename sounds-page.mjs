/* Sounds-only navigation. Does not alter the main application. */
const views={library:'sounds-library',record:'sounds-record',import:'sounds-import',
 create:'sounds-create',generate:'sounds-generate',discover:'discover'};
const tabs=[...document.querySelectorAll('#sounds-tabs [data-view]')];
function select(view,updateHash=true){
 if(!Object.hasOwn(views,view))view='library';
 for(const tab of tabs){const selected=tab.dataset.view===view;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1}
 for(const [name,id] of Object.entries(views))document.getElementById(id).hidden=name!==view;
 if(updateHash){const url=new URL(location.href);url.hash=view;history.replaceState(history.state,'',url)}
}
for(const tab of tabs){
 tab.addEventListener('click',()=>select(tab.dataset.view));
 tab.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=tabs.indexOf(tab);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
   (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].focus();select(tabs[next].dataset.view);
 });
}
window.addEventListener('hashchange',()=>select(location.hash.slice(1),false));
select(location.hash.slice(1),false);
