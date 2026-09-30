import {test,expect} from '@playwright/test';

const valid=()=>({sourceAudioDuration:16.25,videoDuration:16.041667,videoStart:0,audioStart:0,fps:24,width:720,height:1280});

test('T61B tail repair: observed shortfall preserves full approved audio and pads only final frame',async()=>{
 const {planVideoTailRepair}=await import('../../lib/video-tail-repair.ts');
 const input=valid(), before=structuredClone(input), result=planVideoTailRepair(input);
 expect(result.targetDuration).toBe(16.25);
 expect(result.padSeconds).toBeCloseTo(0.208333,6);
 expect(result.padFrames).toBe(5);
 expect(result.replaceWithSourceAudio).toBe(true);
 expect(input).toEqual(before);
});

test('T61B tail repair: already aligned video does not request frame padding',async()=>{
 const {planVideoTailRepair}=await import('../../lib/video-tail-repair.ts');
 expect(planVideoTailRepair({...valid(),videoDuration:16.25})).toMatchObject({targetDuration:16.25,padSeconds:0,padFrames:0,replaceWithSourceAudio:true});
});

for(const [name,change] of [
 ['more than six frames missing',{videoDuration:15.99}],
 ['longer video',{videoDuration:16.3}],
 ['shifted picture',{videoStart:0.1}],
 ['shifted audio',{audioStart:0.1}],
 ['wrong frame rate',{fps:30}],
 ['wrong resolution',{width:1280,height:720}],
 ['nonfinite duration',{sourceAudioDuration:NaN}],
 ['over segment limit',{sourceAudioDuration:21}],
 ['empty source',{sourceAudioDuration:0}],
 ['invalid media duration',{videoDuration:-1}],
])test(`T61B tail repair: rejects ${name} instead of disguising media mismatch`,async()=>{
 const {planVideoTailRepair}=await import('../../lib/video-tail-repair.ts');
 expect(()=>planVideoTailRepair({...valid(),...change})).toThrow();
});
