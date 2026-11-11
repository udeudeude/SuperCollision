/* Prioritize actual SuperCollider messages over optional activity visualizers.
 * The bridge never changes, timestamps, or drops an original packet.
 * Extra mix-control packets remain an optional, independent side effect.
 */
export function createPriorityOscBridge({
 sendToSynth, sendToLanguage, observeOutgoing=[], observeIncoming=[],
 sendControl=sendToSynth, onObserverError=()=>{}
}) {
 if(typeof sendToSynth!=='function'||typeof sendToLanguage!=='function')
   throw Error('Both audio endpoints are required.');
 let outgoingCount=0,incomingCount=0,observerErrors=0;
 function notify(observers,packet,direction){
   for(const observer of observers){
     let controlPackets;
     try{controlPackets=observer(packet)||[]}catch(error){
       observerErrors++;
       onObserverError(error,direction);
       continue;
     }
     if(!Array.isArray(controlPackets))continue;
     for(const control of controlPackets){
       try{sendControl(control)}catch(error){
         observerErrors++;
         onObserverError(error,direction+' control');
       }
     }
   }
 }
 return {
   // Preserve the preexisting byte-copy boundary on language→synth.
   fromLanguage(packet){
     const bytes=new Uint8Array(packet);
     sendToSynth(bytes);
     outgoingCount++;
     notify(observeOutgoing,packet,'outgoing');
   },
   fromSynth(packet){
     sendToLanguage(packet);
     incomingCount++;
     notify(observeIncoming,packet,'incoming');
   },
   diagnostics(){return {outgoingCount,incomingCount,observerErrors}}
 };
}
