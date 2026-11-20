import assert from 'node:assert/strict';
import {waveformPeaks,waveformDragRegion} from '../sounds-waveform.mjs';
const audio=(...channels)=>({
 length:channels[0].length,
 numberOfChannels:channels.length,
 getChannelData:index=>Float32Array.from(channels[index])
});
assert.deepEqual(waveformPeaks(audio([0,-0.9,0.8,0.25]),2).map(pair=>pair.map(n=>Number(n.toFixed(2)))),[[-0.9,0],[0,0.8]]);
assert.deepEqual(waveformPeaks(audio([0.5,0.2],[-0.4,0.6]),2).map(pair=>pair.map(n=>Number(n.toFixed(2)))),[[-0.4,0.5],[0,0.6]]);
assert.equal(waveformPeaks(audio([1,0,-1]),512).length,3);
assert.deepEqual(waveformPeaks(audio([NaN,Infinity]),1),[[0,0]]);
assert.throws(()=>waveformPeaks(audio([]),12),/audio/);
assert.throws(()=>waveformPeaks(audio([1]),4096),/width/);
assert.deepEqual(waveformDragRegion(0.2,0.8),{start:20,finish:80});
assert.deepEqual(waveformDragRegion(0.8,0.2),{start:20,finish:80});
assert.deepEqual(waveformDragRegion(1,1),{start:99,finish:100});
assert.deepEqual(waveformDragRegion(-1,0),{start:0,finish:1});
assert.deepEqual(waveformDragRegion(0.495,0.495),{start:50,finish:51});
console.log('Read-only waveform peaks, stereo extrema and gesture range validation passed.');
