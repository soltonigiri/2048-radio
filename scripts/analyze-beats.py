import numpy as np, subprocess,json
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks
from pathlib import Path
Path('.local').mkdir(parents=True, exist_ok=True)
out={}
for slug,nominal in [('lobby-time',128)]:
 sr=8000; hop=40; size=512
 x=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',f'assets/audio/{slug}.mp3','-ac','1','-ar',str(sr),'-f','f32le','pipe:1']),dtype='<f4')
 # Chunked FFT: keep memory bounded even for the longest song.
 frames=np.lib.stride_tricks.sliding_window_view(x,size)[::hop]
 env=[]; prev=np.zeros(size//2+1)
 for start in range(0,len(frames),2048):
  mag=np.log1p(np.abs(np.fft.rfft(frames[start:start+2048]*np.hanning(size)))*20)
  flux=np.maximum(0,np.diff(np.vstack([prev,mag]),axis=0))
  # Emphasize bass and percussion attacks, reducing sustained piano harmonics.
  env.extend((flux[:,2:18].mean(axis=1)*.6+flux[:,45:200].mean(axis=1)*.4).tolist())
  prev=mag[-1]
 env=np.array(env); times=np.arange(len(env))*hop/sr+size/(2*sr)
 envelope=gaussian_filter1d(env,1)
 # Normalize local dynamics, rather than letting the loudest section dominate.
 envelope/=np.maximum(gaussian_filter1d(envelope,200),.01)
 mask=(times>3)&(times<len(x)/sr-5)
 t=times[mask]; e=np.minimum(envelope[mask],5)
 best=(-1,None,None)
 for bpm in np.arange(nominal-2,nominal+2,.005):
  period=60/bpm
  phase=np.remainder(t,period)
  bins=np.floor(phase/period*96).astype(int)
  comb=np.bincount(bins,weights=e,minlength=96)/np.maximum(1,np.bincount(bins,minlength=96))
  sm=gaussian_filter1d(comb,1.2,mode='wrap'); i=np.argmax(sm)
  if sm[i]>best[0]: best=(sm[i],float(bpm),float((i+.5)*period/96))
 _,bpm,offset=best
 print(slug,'bpm',round(bpm,4),'phase',round(offset,4), 'score',round(best[0],2),flush=True)
 windows=[]
 for start in [5,35,75,120,170,230,270]:
  mask=(times>=start)&(times<start+20)
  if mask.sum()<500:continue
  beat=np.arange(offset,start+21,60/bpm);beat=beat[(beat>=start)&(beat<start+20)]
  pks,_=find_peaks(envelope[mask],distance=25,prominence=.3)
  onsets=times[mask][pks]
  deltas=[float(onsets[np.argmin(abs(onsets-v))]-v) for v in beat] if len(onsets) else []
  windows.append({'start':start,'medianAttackOffsetMs':round(np.median(deltas)*1000,1),'p80AbsMs':round(np.percentile(np.abs(deltas),80)*1000,1)})
 out[slug]={'bpm':round(bpm,4),'offset':round(offset,4),'windows':windows}
 print(windows,flush=True)
 np.savez(f'.local/{slug}-onsets.npz',times=times,onsets=envelope)
Path('.local/beat-analysis.json').write_text(json.dumps(out,indent=2)+'\n')
