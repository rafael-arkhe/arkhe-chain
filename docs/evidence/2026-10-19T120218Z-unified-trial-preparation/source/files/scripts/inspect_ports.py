"""Read-only inventory of declared Arkhe ports; never scans remote hosts or edits listeners."""
import argparse,concurrent.futures,json,os,socket,subprocess,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HEALTH={7473:'/health',7475:'/health',8788:'/health',8787:'/health',9090:'/-/ready',3002:'/api/health'}
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default='ops/local/ports-report.json');args=parser.parse_args()
 target=(ROOT/args.output).resolve()
 if not target.is_relative_to(ROOT):raise SystemExit('Output leaves workspace')
 registry=json.loads((ROOT/'config/ports.json').read_text())['ports'];assert len({x['port'] for x in registry})==len(registry)
 listeners=[]
 if os.name=='nt':
  cmd='Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress'
  result=subprocess.run(['powershell','-NoProfile','-Command',cmd],capture_output=True,text=True)
  if result.returncode==0: listeners=json.loads(result.stdout or '[]');listeners=listeners if isinstance(listeners,list) else [listeners]
 cfgpath=ROOT/'ops/local/live.json';cfg=json.loads(cfgpath.read_text()) if cfgpath.exists() else {}
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def probe(entry):
  row={**entry,'tcp_reachable':False,'windows_bindings':[],'http_status':None,'notes':[]}
  row['windows_bindings']=[{'address':x['LocalAddress'],'pid':x['OwningProcess']} for x in listeners if x['LocalPort']==entry['port']]
  if any(x['address'] not in ['127.0.0.1','::1'] for x in row['windows_bindings']):row['notes'].append('NON_LOOPBACK_LISTENER_REQUIRES_ADMIN_DEPLOYMENT')
  try:
   with socket.create_connection(('127.0.0.1',entry['port']),timeout=1):row['tcp_reachable']=True
  except OSError:pass
  if entry['port'] in HEALTH:
   headers={'Authorization':'Bearer '+cfg['token']} if entry['port']==8788 and cfg.get('token') else {}
   try:
    with opener.open(urllib.request.Request('http://127.0.0.1:'+str(entry['port'])+HEALTH[entry['port']],headers=headers),timeout=2) as response:row['http_status']=response.status
   except urllib.error.HTTPError as error:row['http_status']=error.code
   except OSError:pass
  return row
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:ports=list(pool.map(probe,registry))
 report={'scope':'Loopback probes only; Windows listeners may omit WSL forwarding','ports':ports,'unrelated_listeners_modified':False}
 target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,indent=2)+'\n')
 for row in ports:print(str(row['port'])+' '+row['service']+': TCP='+str(row['tcp_reachable'])+' HTTP='+str(row['http_status'])+' '+','.join(row['notes']))
 print('Saved '+str(target.relative_to(ROOT))+'; no credentials in report')
if __name__=='__main__':main()
