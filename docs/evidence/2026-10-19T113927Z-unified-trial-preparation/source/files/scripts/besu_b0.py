"""Reproducible local B0: four isolated QBFT validators, no public RPC writes.
Requires pinned ethers/solc under ops/local/besu-tools and a persisted checkpoint.
"""
import argparse,ipaddress,json,os,re,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
IMAGE='docker.io/hyperledger/besu:26.7.1'
LABEL='io.arkhe.besu-b0'

def version_gate(text):
 m=re.search(r'besu/v(\d+)\.(\d+)\.(\d+)',text,re.I)
 if not m or tuple(map(int,m.groups()))<(26,7,1): raise ValueError('Besu >=26.7.1 required')
 return m.group(0)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['up','anchor','stop']);p.add_argument('--engine',choices=['docker','podman'],default='podman');p.add_argument('--connection',default='arkhe-runtime');p.add_argument('--checkpoint');a=p.parse_args()
 engine=[a.engine]+(['--connection',a.connection] if a.engine=='podman' else [])
 def run(args,**kw):return subprocess.run(engine+args,check=True,**kw)
 def capture(args):return subprocess.check_output(engine+args,text=True).strip()
 def owned(name):
  r=subprocess.run(engine+['inspect',name],capture_output=True,text=True)
  if r.returncode:return False
  obj=json.loads(r.stdout)[0]
  if obj.get('Config',{}).get('Labels',{}).get(LABEL)!='v1':raise RuntimeError('unrelated container: '+name)
  return True
 env={**os.environ,'NODE_PATH':str(ROOT/'ops/local/besu-tools/node_modules')}
 if a.action=='stop':
  for i in range(4):
   name=f'arkhe-besu-b0-{i}'
   if owned(name):run(['stop',name])
  return
 if a.action=='anchor':
  if not a.checkpoint:raise ValueError('--checkpoint required')
  subprocess.run(['node',str(ROOT/'ops/besu/anchor.cjs'),a.checkpoint],env=env,check=True);return
 version=version_gate(capture(['run','--rm',IMAGE,'--version']));print('PASS '+version,flush=True)
 wallet=ROOT/'ops/local/besu-b0/wallet.json'
 if not wallet.exists():subprocess.run(['node',str(ROOT/'ops/besu/anchor.cjs'),'wallet'],env=env,check=True)
 address=json.loads(wallet.read_text())['address']
 volume='arkhe-besu-b0-data';network='arkhe-besu-b0'
 for kind,name in [('volume',volume),('network',network)]:
  inspected=subprocess.run(engine+[kind,'inspect',name],capture_output=True,text=True)
  if inspected.returncode:run([kind,'create','--label',LABEL+'=v1',name])
  else:
   resource=json.loads(inspected.stdout)[0]
   if (resource.get('Labels') or resource.get('labels') or {}).get(LABEL)!='v1':raise RuntimeError('unrelated '+kind+': '+name)
 config={'genesis':{'config':{'chainId':172026,'berlinBlock':0,'qbft':{'blockperiodseconds':2,'epochlength':30000,'requesttimeoutseconds':4}},'nonce':'0x0','timestamp':'0x0','gasLimit':'0x1fffffffffffff','difficulty':'0x1','mixHash':'0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365','coinbase':'0x'+'00'*20,'alloc':{address:{'balance':'0x3635c9adc5dea00000'}}},'blockchain':{'nodes':{'generate':True,'count':4}}}
 base=['run','--rm','-i','--user','0','--entrypoint','sh','-v',volume+':/work',IMAGE]
 run(base+['-c','cat > /work/config.json'],input=json.dumps(config).encode())
 # Never overwrite existing keys or chain state on rerun.
 run(base+['-c','if [ -d /work/generated ] && [ ! -f /work/generated/genesis.json ]; then rmdir /work/generated; fi; if [ ! -f /work/generated/genesis.json ]; then /opt/besu/bin/besu operator generate-blockchain-config --config-file=/work/config.json --to=/work/generated --private-key-file-name=key; fi'])
 run(base+['-c','set -eu; i=0; for d in /work/generated/keys/*; do mkdir -p /work/node$i; if [ ! -f /work/node$i/key ]; then cp "$d/key" /work/node$i/key; cp "$d/key.pub" /work/node$i/key.pub; fi; i=$((i+1)); done'])
 info=json.loads(capture(['network','inspect',network]))[0]
 subnet=(info.get('subnets') or info.get('Subnets'))
 cidr=subnet[0]['subnet'] if subnet else info['IPAM']['Config'][0]['Subnet']
 net=ipaddress.ip_network(cidr)
 ips=[str(net.network_address+10+i) for i in range(4)]
 peers=['enode://'+capture(base+['-c',f'cat /work/node{i}/key.pub']).removeprefix('0x')+'@'+ips[i]+':30303' for i in range(4)]
 for i in range(4):run(base+['-c',f'cat > /work/node{i}/static-nodes.json'],input=json.dumps([p for j,p in enumerate(peers) if j!=i]).encode())
 for i in range(4):
  name=f'arkhe-besu-b0-{i}'
  if owned(name):
   state=json.loads(capture(['inspect',name]))[0]['State']
   if state['Running']:continue
   run(['rm',name])
  args=['run','-d','--name',name,'--label',LABEL+'=v1','--network',network,'--ip',ips[i],'--user','0','-v',volume+':/work','-e','JAVA_OPTS=-Xms64m -Xmx256m']
  if i==0:args+=['-p','127.0.0.1:18545:8545']
  args +=[IMAGE,'--data-path=/work/node'+str(i),'--genesis-file=/work/generated/genesis.json','--profile=ENTERPRISE','--discovery-enabled=false','--min-gas-price=0','--rpc-http-enabled','--rpc-http-host=0.0.0.0','--rpc-http-api=ETH,NET,QBFT,WEB3','--host-allowlist=localhost,127.0.0.1','--p2p-host='+ips[i]]
  run(args)
 deadline=time.monotonic()+180
 while time.monotonic()<deadline:
  try:
   data=json.dumps({'jsonrpc':'2.0','id':1,'method':'eth_blockNumber','params':[]}).encode()
   r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18545',data,{'Content-Type':'application/json'}),timeout=3))
   if int(r['result'],16)>0:print('PASS four-validator QBFT produces blocks');return
  except (OSError,ValueError,KeyError):pass
  time.sleep(2)
 raise RuntimeError('QBFT failed to produce a block within 180 seconds')
if __name__=='__main__':main()
