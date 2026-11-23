from pathlib import Path
import base64,gzip,re
root=Path(__file__).resolve().parent.parent
html=(root/'librivox-explorer.html').read_text()
css=(root/'librivox-explorer.css').read_text()
core=(root/'librivox-text-locator.mjs').read_text().replace('export function ','function ')
js=(root/'librivox-explorer.mjs').read_text()
js=js.replace("import {findChapterPhraseMatches, estimateChapterSeek, toggleExplorerFavorite} from './librivox-text-locator.mjs';",core)
extractor=(root/'librivox-audio-extract.mjs').read_text().replace('export const ','const ').replace('export function ','function ').replace('export async function ','async function ')
store=(root/'sounds-store.mjs').read_text().replace('export const ','const ').replace('export async function ','async function ')
js=js.replace("import {saveSound} from './sounds-store.mjs';",store)
js=js.replace("import {extractWavFromSource,fetchRecording} from './librivox-audio-extract.mjs';",extractor)
assert 'import {' not in js
html=html.replace('<link rel="stylesheet" href="./librivox-explorer.css">',f'<style>\n{css}\n</style>')
html=html.replace('<script type="module" src="./librivox-explorer.mjs"></script>',f'<script type="module">\n{js}\n</script>')
blob=base64.b64encode(gzip.compress(html.encode('utf-8'),compresslevel=9,mtime=0)).decode('ascii')
bootstrap='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#171917"><title>LibriVox Explorer · SuperCollision</title></head><body><script>
(async()=>{try{const zipped=Uint8Array.from(atob("PAYLOAD"),c=>c.charCodeAt(0));const html=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();document.open();document.write(html);document.close();}catch(error){document.body.textContent='Preview could not start: '+error.message;}})();
</script></body></html>'''
packed=bootstrap.replace('PAYLOAD',blob)
assert gzip.decompress(base64.b64decode(blob)).decode('utf-8')==html
(root/'librivox-test.html').write_text(packed)
print('Plain source:',len(html.encode()),'packed:',len(packed.encode()),'b64:',len(blob))