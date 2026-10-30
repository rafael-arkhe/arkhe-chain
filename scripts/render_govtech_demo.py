"""Render a narrated walkthrough from real CUA screenshots; never fabricates UI."""
from pathlib import Path
import concurrent.futures, json, math, re, shutil, subprocess, textwrap, wave
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'output/govtech/video'
FFMPEG=shutil.which('ffmpeg')
if not FFMPEG: raise SystemExit('ffmpeg is required')
SCENES=json.loads((BASE/'scenes.json').read_text(encoding='utf-8'))
FRAMES=BASE/'frames';CLIPS=BASE/'clips'
FRAMES.mkdir(exist_ok=True);CLIPS.mkdir(exist_ok=True)
RATE=1.25
FONT=Path('C:/Windows/Fonts/segoeui.ttf')
BOLD=Path('C:/Windows/Fonts/segoeuib.ttf')
def font(size,bold=False):return ImageFont.truetype(str(BOLD if bold else FONT),size)
def run(args,log):
    result=subprocess.run([FFMPEG,'-hide_banner','-y',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    log.write_bytes(result.stderr)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-2500:])
def timestamp(seconds,comma=False):
    ms=round(seconds*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02}{"," if comma else "."}{ms:03}'
def make_frame(scene,source):
    canvas=Image.new('RGB',(1920,1080),'#102e25');d=ImageDraw.Draw(canvas)
    d.text((160,22),'ARKHE GOVTECH  /  DEMONSTRAÇÃO DO APLICATIVO',font=font(22,True),fill='#ecf0df')
    d.text((1760,27),f'{int(scene["id"]):02} / {len(SCENES):02}',font=font(18),fill='#b4c7a8',anchor='ra')
    im=Image.open(source).convert('RGB');im=im.resize((1600,900),Image.Resampling.LANCZOS)
    canvas.paste(im,(160,80));d.rounded_rectangle((159,79,1760,980),radius=3,outline='#9aad8c',width=1)
    d.text((160,995),scene['title'],font=font(27,True),fill='#edf2e2')
    d.text((160,1035),scene['subtitle'],font=font(20),fill='#b6c9ab')
    d.text((1760,1042),'DADOS SINTÉTICOS · NARRAÇÃO SINTETIZADA',font=font(13),fill='#9aaf8e',anchor='ra')
    path=FRAMES/(source.stem+'.png');canvas.save(path);return path

offset=0.;subtitles=[];chapter=[';FFMETADATA1','title=Arkhe GovTech — Demonstração completa','artist=Arkhe','comment=Montagem narrada com capturas reais do aplicativo. Dados sintéticos; sem despacho estatal.']
manifest=[];subindex=0
for scene in SCENES:
    wav=BASE/'audio'/f'{scene["id"]}.wav'
    with wave.open(str(wav)) as w: original=w.getnframes()/w.getframerate()
    scene['speechDuration']=original/RATE;scene['duration']=scene['speechDuration']+1.5
    scene['start']=offset
    sources=[BASE/'scenes'/f'{scene["id"]}.png']
    alt=BASE/'scenes'/f'{scene["id"]}b.png'
    if alt.exists():sources.append(alt)
    frames=[make_frame(scene,p) for p in sources]
    duration=scene['duration']/len(frames)
    lines=[]
    for p in frames:lines.extend([f"file '{p.as_posix()}'",f'duration {duration:.6f}'])
    lines.append(f"file '{frames[-1].as_posix()}'")
    (CLIPS/f'{scene["id"]}-images.txt').write_text('\n'.join(lines),encoding='utf-8')
    sentences=re.split(r'(?<=[.!?])\s+',scene['narration'])
    weights=[len(x) for x in sentences];total=sum(weights);position=offset+.3
    for sentence,weight in zip(sentences,weights):
        end=position+scene['speechDuration']*weight/total
        subindex+=1;wrapped='\n'.join(textwrap.wrap(sentence,78))
        subtitles.append(f'{subindex}\n{timestamp(position,True)} --> {timestamp(end,True)}\n{wrapped}\n')
        position=end
    chapter.extend(['[CHAPTER]','TIMEBASE=1/1000',f'START={round(offset*1000)}',f'END={round((offset+scene["duration"])*1000)}',f'title={scene["title"]}'])
    manifest.append({'scene':scene['id'],'title':scene['title'],'start':timestamp(offset),'duration':round(scene['duration'],3),'sources':[p.name for p in sources]})
    offset+=scene['duration']
(BASE/'arkhe-govtech-legendas.srt').write_text('\n'.join(subtitles),encoding='utf-8')
(BASE/'chapters.ffmeta').write_text('\n'.join(chapter),encoding='utf-8')
(BASE/'timeline.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

def encode(scene):
    sid=scene['id'];dur=scene['duration']
    args=['-f','concat','-safe','0','-i',str(CLIPS/f'{sid}-images.txt'),'-i',str(BASE/'audio'/f'{sid}.wav'),
          '-filter_complex',f'[0:v]fps=24,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st={dur-.25:.4f}:d=0.25[v];[1:a]atempo={RATE},adelay=300:all=1,apad=pad_dur=1.2[a]',
          '-map','[v]','-map','[a]','-t',f'{dur:.6f}','-c:v','libx264','-preset','veryfast','-tune','stillimage','-crf','22','-threads','2',
          '-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-video_track_timescale','24000',str(CLIPS/f'{sid}.mp4')]
    run(args,CLIPS/f'{sid}-encode.log')
    print(f'Encoded {sid}: {scene["title"]}',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(encode,SCENES))
(BASE/'clips.txt').write_text('\n'.join(f"file '{(CLIPS/(s['id']+'.mp4')).as_posix()}'" for s in SCENES),encoding='utf-8')
output=BASE/'arkhe-govtech-demonstracao-completa.mp4'
run(['-f','concat','-safe','0','-i',str(BASE/'clips.txt'),'-i',str(BASE/'arkhe-govtech-legendas.srt'),'-i',str(BASE/'chapters.ffmeta'),
     '-map','0:v','-map','0:a','-map','1:0','-map_metadata','2','-map_chapters','2','-c','copy','-c:s','mov_text','-metadata:s:s:0','language=por','-movflags','+faststart',str(output)],BASE/'mux.log')
probe=shutil.which('ffprobe')
result=subprocess.run([probe,'-v','error','-show_format','-show_streams','-show_chapters','-of','json',str(output)],capture_output=True,check=True)
report=json.loads(result.stdout);(BASE/'media-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert any(s.get('codec_type')=='video' and s.get('width')==1920 and s.get('height')==1080 for s in report['streams'])
assert any(s.get('codec_type')=='audio' for s in report['streams'])
assert any(s.get('codec_type')=='subtitle' for s in report['streams'])
assert len(report['chapters'])==19
assert abs(float(report['format']['duration'])-offset)<2
print(f'COMPLETE: {output}; {offset:.1f}s; {output.stat().st_size/1024/1024:.1f} MiB',flush=True)
