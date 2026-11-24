/* Run locally with: node qa/sounds-reach-contract.mjs
 * Layout integration checks are intentionally offline and use no browser,
 * sound engine, network or GitHub Actions minutes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
const page=read('sounds-bench-preview.html');
const style=read('sounds-reach.css');
const engine=read('sounds-bench-engine.mjs');
const acquire=read('sounds-bench-acquire.mjs');
const recorder=read('sounds-library.mjs');
const original=read('sounds-original-preview.mjs');
const library=read('librivox-explorer.html');
const libra=read('librivox-explorer.mjs');
const remote=read('sounds-bench-remote.mjs');
const manifest=JSON.parse(read('lab-offline-assets.json'));
let checks=0;
function check(condition,label){assert.ok(condition,label);checks++}
for(const p of [
 'sounds-bench-engine.mjs','sounds-bench-acquire.mjs','sounds-original-preview.mjs',
 'sounds-bench-remote.mjs','librivox-explorer.mjs','sounds-library.mjs'
]){
 execFileSync(process.execPath,['--check',join(root,p)]);
 checks++;
}
for(const match of page.matchAll(/<script(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/g)){
 new Function(match[1]);checks++;
}
check(page.includes('<small>v0.6.1</small>'),'visible version');
check(page.includes('sounds-reach.css?v=0.6.0'),'new shared reach layout');
check(library.includes('preview-note">v0.6.1'),'LibriVox visible version');
check(library.includes('librivox-explorer.css?v=0.6.0'),'LibriVox CSS freshness');
check(page.includes('sounds-bench-engine.mjs?v=0.6.0'),'engine freshness');
check(page.includes('sounds-bench-acquire.mjs?v=0.6.0'),'acquisition freshness');
check(acquire.includes('sounds-bench-remote.mjs?v=0.6.0'),'remote freshness');
check(remote.includes('librivox-explorer.html?v=0.6.0&embedded=1'),'embedded LibriVox freshness');
check(style.includes('grid-template-rows:auto minmax(0,1fr) auto auto'),'four-zone display');
check(style.includes('grid-row:4!important'),'bottom navigation');
check(page.includes('playActions.append(engineControl)'),'actual engine action moved');
check(page.includes('sampleActions.append(make)'),'actual sample making moved');
check(page.includes('sampleControls.append(control)'),'actual native playback moved');
check(page.includes('contextDetail.textContent=phaseLabel.textContent'),'real engine state at top');
check(engine.includes('bench-original-dock-slot'),'native original player reachable');
check(original.includes('getChannelData(i)'),'waveform uses audio data');
check(original.includes('canvas.setPointerCapture'),'waveform scrub is interactive');
check(original.includes('duration()>90'),'waveform analysis memory limited');
check(!original.includes('audio.play('),'no automatic original playback');
check(acquire.includes('footerPanels.record.append'), 'record at bottom');
check(acquire.includes('footerPanels.discover.append(discoverySearch)'), 'search at bottom');
check(acquire.includes('libraryDock.append(searchbar)'), 'Library search at bottom');
check(acquire.includes("setAttribute('form','discover-form')"), 'discover submit intact');
check(acquire.includes("setAttribute('form','acquire-code-form')"), 'code submit intact');
check(acquire.includes('footerPanels[kind].append(audition.audio,bar)'), 'recordings auditable after save');
check(libra.includes("['listen','LISTEN']")&&libra.includes("['locate','LOCATE']")&&libra.includes("['extract','EXTRACT']"), 'LibriVox work modes');
check(libra.includes('workDock.append(player)'),'persistent chapter player');
check(libra.includes("modePanels.extract.append(control)"),'actual extraction controls reused');
check(libra.includes("selectWorkMode('listen');audio.src"),'new chapter opens listening tools');
check(libra.includes("event.source!==window.parent"),'frame message source guard retained');
check(libra.includes("permit-audio-download"),'download permission retained');
check(engine.includes("await transport.sync({signal:controller.signal,timeoutMs:5000})"), 'native buffer responsiveness preflight');
check(page.includes("stopCodeControl.id='lab-tone-stop'"),'real Stop All control in bottom Code transport');
check(page.includes("bench-stop-all-audio"),'Stop action not an inert button');
check(engine.includes("lang.runCode('CmdPeriod.run;')"),'Stop interrupts SuperCollider routines');
check(engine.includes("synth.sendOsc(oscMessage('/clearSched'))"),'Stop clears scheduled native commands');
check(engine.includes("synth.sendOsc(oscMessage('/g_freeAll'"),'Stop frees native synthesizer nodes');
check(engine.includes("toneStop.disabled=!lang||!serverReady"),'Stop readiness state is synchronized');
check(acquire.includes("recordMonitor.id='bench-record-monitor'"),'recording monitor in seeing area');
check(acquire.includes("footerPanels.record.append($('start'))"),'recording action stays in thumb area');
check(recorder.includes("const rms=Math.sqrt(sum/data.length)"),'actual input level from microphone samples');
check(recorder.includes("drawMic(data);updateTime();"),'actual waveform and elapsed time updated');
check(recorder.includes("recordingStart=performance.now()"),'elapsed time starts with actual recording');
check(recorder.includes("window.AudioContext||window.webkitAudioContext"),'microphone monitor supports WebKit audio');
check(recorder.includes("setMonitorHint('Recording saved. Play the unchanged original"),'saved original remains auditable');
check(manifest.files.some(x=>x.path==='/sounds-reach.css'),'new reach styling in offline pack');
for(const name of ['sounds-reach.css','sounds-original-preview.mjs','sounds-bench-preview.html',
 'sounds-bench-engine.mjs','sounds-bench-acquire.mjs','sounds-bench-remote.mjs','sounds-library.mjs',
 'librivox-explorer.html','librivox-explorer.css','librivox-explorer.mjs']){
 const record=manifest.files.find(x=>x.path==='/'+name);
 check(Boolean(record),'offline asset '+name);
 check(record.bytes===Buffer.byteLength(read(name),'utf8'),'offline byte count '+name);
}
console.log('Sounds reach-first contract:',checks,'checks passed.');
