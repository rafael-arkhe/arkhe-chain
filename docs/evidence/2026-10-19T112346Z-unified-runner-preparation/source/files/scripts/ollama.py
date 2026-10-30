"""Run Arkhe with the installed local Ollama; never pulls models or enables external tools."""
import argparse,json,os,subprocess,time,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path,default=ROOT/'config/ollama.json');p.add_argument('action',choices=['status','chat','triage']);p.add_argument('arguments',nargs='*');a=p.parse_args()
 config=json.loads(a.config.read_text());endpoint=config['base_url'].rstrip('/');url=urllib.parse.urlsplit(endpoint)
 if url.hostname not in ['127.0.0.1','localhost','::1'] or url.scheme!='http':raise ValueError('launcher requires a local HTTP Ollama endpoint')
 def ready():
  try:
   with urllib.request.urlopen(endpoint+'/api/version',timeout=2) as r:return r.status==200
  except OSError:return False
 if not ready():
  executable=Path(os.environ.get('ARKHE_OLLAMA_EXE',str(Path.home()/'AppData/Local/Programs/Ollama/ollama.exe')))
  if not executable.is_file():raise FileNotFoundError('Set ARKHE_OLLAMA_EXE to the installed Ollama executable')
  log=ROOT/'ops/local/ollama-server.log';log.parent.mkdir(parents=True,exist_ok=True)
  env={**os.environ,'OLLAMA_HOST':url.netloc}
  with log.open('ab') as output:
   subprocess.Popen([str(executable),'serve'],stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,env=env,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0,start_new_session=os.name!='nt')
  deadline=time.monotonic()+30
  while not ready():
   if time.monotonic()>deadline:raise RuntimeError('Ollama did not become ready; inspect ops/local/ollama-server.log')
   time.sleep(.5)
 env={**os.environ,'ARKHE_OLLAMA_CONFIG':str(a.config.resolve())}
 if a.action=='triage':command=['cargo','run','--locked','-p','arkhe-bugbounty','--bin','ollama_triage','--',*a.arguments]
 else:command=['cargo','run','--locked','-p','arkhe-ollama','--',a.action,*a.arguments]
 subprocess.run(command,cwd=ROOT,env=env,check=True)
if __name__=='__main__':main()
