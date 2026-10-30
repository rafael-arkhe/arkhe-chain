"""Paired IPv4 TCP/UDP/DNS experiment on a private disposable Podman network."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import secrets

from containment_probe import ROOT, decode_observation, write_json
from containment_network import NETWORK_VECTORS, parse_events, positive_response, evaluate
from run_containment_trial import Trial, IMAGE, bounded
from runtime_containment import digest


class NetworkTrial(Trial):
    def __init__(self,output,machine,image):
        super().__init__(output,machine,image,NETWORK_VECTORS)
        self.network_id=None
        self.network_name=None
        self.canary_id=None
        self.canary_address=None
        self.binary=None
        self.allowed_nonces={self.session_nonce(v) for v in NETWORK_VECTORS}
        self.report['scope']='Finite IPv4 TCP/UDP/fixed-DNS experiment. Private fixture only; no public destinations, published ports, IPv6 or system-resolver certification. runtime_verified=false.'
        self.report['trial']['profile']='network-paired-v1'

    def session_nonce(self,vector):
        return json.loads((self.output/'session/requests'/f'{vector}.json').read_text())['nonce']

    def policy(self,name,snapshot,command,arguments=()):
        args=super().policy(name,snapshot,command,arguments)
        prefix='arkhe-containment-'+self.run_id+'-'
        if name==prefix+'oracle' or name.startswith(prefix+'positive-'):
            if not self.network_id:
                raise ValueError('private fixture network is absent')
            args[args.index('--network=none')]='--network='+self.network_id
        return args

    def after_build_container(self,identity):
        self.binary=(self.output/'probe-linux').read_bytes()
        source=ROOT/'packaging/sandbox/containment-probe/network-canary.rs'
        folder=self.output/'oracle-build-input';folder.mkdir()
        (folder/'network-canary.rs').write_bytes(source.read_bytes())
        (folder/'network-wire.rs').write_bytes((self.output/'session/network-wire.rs').read_bytes())
        build_id,policy=self.create('oracle-build',folder,
            'rustc --edition=2021 -C opt-level=s -C strip=symbols /input/network-canary.rs -o /work/canary && cat /work/canary')
        binary=self.call(self.engine+['start','--attach',build_id],timeout=60)
        if not binary.startswith(b'\x7fELF') or self.inspect(build_id)['State']['ExitCode']!=0:
            raise ValueError('trusted canary compilation failed')
        (self.output/'canary-linux').write_bytes(binary)
        self.report['canary_build']={'container_id':build_id,'source_sha256':digest(source),
            'wire_sha256':digest(folder/'network-wire.rs'),'binary_sha256':hashlib.sha256(binary).hexdigest(),'policy':policy}
        self.remove(build_id)
        self.network_name='arkhe-containment-'+self.run_id
        self.call(self.engine+['network','create','--internal','--disable-dns','--label',
                  'io.arkhe.containment.run='+self.run_id,self.network_name])
        network=json.loads(self.call(self.engine+['network','inspect',self.network_name]))[0]
        if not network['internal'] or network['dns_enabled'] or network.get('labels',{}).get('io.arkhe.containment.run')!=self.run_id:
            raise ValueError('private network policy or ownership mismatched')
        self.network_id=network['id']
        self.report['fixture_network']=network
        fixture=self.output/'oracle-input';fixture.mkdir();(fixture/'canary').write_bytes(binary)
        self.canary_id,policy=self.create('oracle',fixture,
            'cp /input/canary /work/canary && chmod 755 /work/canary && exec /work/canary "$1"',(self.run_id,))
        self.call(self.engine+['start',self.canary_id])
        state=self.inspect(self.canary_id)
        networks=state['NetworkSettings']['Networks']
        if len(networks)!=1 or state['HostConfig'].get('PortBindings'):
            raise ValueError('oracle published ports or joined multiple networks')
        self.canary_address=next(iter(networks.values()))['IPAddress']
        if not ipaddress.ip_address(self.canary_address).is_private:
            raise ValueError('oracle address is not private')
        external=json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3',
            self.observer,str(state['State']['Pid']),self.canary_id]))
        self.canary_namespace=external['namespaces']['net']
        write_json(self.output/'canary-created.json',state)
        write_json(self.output/'canary-host-oracle.json',external)
        self.events()

    def events(self,cleanup=False):
        raw=self.call(self.engine+['logs',self.canary_id],limit=65536,cleanup=cleanup)
        events=parse_events(raw,self.run_id)
        if any(e['event']=='received' and e['nonce'] not in self.allowed_nonces for e in events):
            raise ValueError('unknown nonce contaminated fixture network')
        return raw,events

    def positive(self,vector,phase):
        nonce=secrets.token_hex(32);self.allowed_nonces.add(nonce)
        fixture=self.output/'positive-input'/f'{vector}-{phase}';fixture.mkdir(parents=True)
        (fixture/'probe').write_bytes(self.binary)
        (fixture/'arkhe-containment-fixture').write_bytes((nonce+'\n').encode())
        (fixture/'network-endpoint').write_bytes((self.canary_address+'\n').encode())
        identity,policy=self.create('positive-'+vector+'-'+phase,fixture,
            'cp /input/probe /work/probe && chmod 755 /work/probe && exec /work/probe "$1" "$2"',(vector,nonce))
        raw=self.call(self.engine+['start','--attach',identity],timeout=3,limit=65536)
        request={'protocol':'arkhe-containment-probe/v1','vector_id':vector,'nonce':nonce}
        observation=decode_observation(raw,request)
        state=self.inspect(identity)
        valid=state['State']['ExitCode']==0 and positive_response(observation,nonce)
        folder=self.output/'positive-receipts';folder.mkdir(exist_ok=True)
        path=folder/f'{vector}-{phase}.json';path.write_bytes(raw)
        write_json(folder/f'{vector}-{phase}.engine.json',state)
        self.remove(identity)
        if not valid:
            raise ValueError('positive private-network control did not receive expected response')
        return {'nonce':nonce,'response_valid':True,'container_id':identity,'policy':policy,
                'receipt_sha256':digest(path),'network_exception':'positive control only; target retains network=none'}

    def before_vector(self,vector,fixture,request):
        (fixture/'network-endpoint').write_bytes((self.canary_address+'\n').encode())
        controls={}
        if vector!='socket-local-control':
            controls['before']=self.positive(vector,'before')
        raw,events=self.events()
        state=self.inspect(self.canary_id)
        return {'controls':controls,'before':events,'raw_before':raw.decode(),
                'running_before':state['State']['Running'],'canary_id':self.canary_id}

    def judge_vector(self,vector,observation,oracle,request,fixture,context):
        if oracle['namespaces']['net']==self.canary_namespace:
            raise ValueError('oracle shares target network namespace')
        if vector!='socket-local-control':
            context['controls']['after']=self.positive(vector,'after')
        raw,events=self.events()
        state=self.inspect(self.canary_id)
        lifecycle={'running_before':context['running_before'],'running_after':state['State']['Running'],
                   'restarts':state['RestartCount']}
        receipt={**context,'after':events,'lifecycle':lifecycle,'private_address':self.canary_address,
                 'canary_id':self.canary_id,'target_net_namespace':oracle['namespaces']['net'],
                 'canary_net_namespace':self.canary_namespace,'target_interfaces':oracle['network'],
                 'claim':'no matching target nonce received for this finite test, not universal packet capture'}
        write_json(self.output/'host-receipts'/f'{vector}.network.json',receipt)
        return evaluate(vector,observation,request,oracle,context['before'],events,context['controls'],lifecycle)

    def finish(self):
        if self.canary_id and self.canary_id in self.ids:
            try:
                raw,events=self.events(cleanup=True)
                (self.output/'canary-events.jsonl').write_bytes(raw)
                write_json(self.output/'canary-final.json',self.inspect(self.canary_id))
            except Exception as error:
                self.report['errors'].append('canary final evidence: '+str(error))
        super().finish()

    def cleanup_auxiliary(self):
        if not self.network_name:
            return
        # Resolve this exact UUID-owned network only. Never prune a network set.
        code,out,err=bounded(self.engine+['network','inspect',self.network_name],3,1048576)
        if code!=0:
            if self.network_id:
                raise ValueError('cannot reconcile owned network')
            return
        network=json.loads(out)[0]
        if network.get('labels',{}).get('io.arkhe.containment.run')!=self.run_id:
            raise ValueError('refuse to remove a foreign network')
        self.call(self.engine+['network','rm',network['id']],timeout=5,cleanup=True)
        code,_,_=bounded(self.engine+['network','exists',network['id']],3,65536)
        if code!=1:
            raise ValueError('network removal not confirmed')
        self.report['network_cleanup']={'network_id':network['id'],'absent':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--machine',default='arkhe-containment')
    parser.add_argument('--image',default=IMAGE)
    args=parser.parse_args()
    return NetworkTrial(args.output,args.machine,args.image).run()


if __name__=='__main__':
    raise SystemExit(main())
