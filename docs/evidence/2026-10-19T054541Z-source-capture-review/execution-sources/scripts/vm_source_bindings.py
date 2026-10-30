"""Resolve suite-owned OCI source bindings and masks from an independent VM reader."""
import argparse,hashlib,importlib.util,json,os,stat
from pathlib import Path

def load_module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def collect(data,parser):
    snapshot=data['snapshot'];state=data['inspect'];cid=state['Id'];pid=snapshot['oracle']['host_pid']
    assert cid==snapshot['oracle']['container_id'] and len(cid)==64
    hostroot=Path('/proc')/str(pid)/'root'
    conmon=state['State']['ConmonPid'];proc=Path('/proc')/str(conmon)
    assert cid.encode() in (proc/'cmdline').read_bytes() and 'conmon' in os.readlink(proc/'exe')
    source_root=proc/'root'
    static=state['StaticDir'];run='/run/user/1000/containers/overlay-containers/'+cid+'/userdata'
    expected='/home/user/.local/share/containers/storage/overlay-containers/'+cid+'/userdata'
    assert static==expected and state['OCIConfigPath']==static+'/config.json'
    raw=(source_root/state['OCIConfigPath'].lstrip('/')).read_bytes();assert len(raw)<=1048576
    config=json.loads(raw);mounts=parser.parse_mountinfo(snapshot['oracle']['mountinfo']);declarations={m['destination']:m for m in config['mounts']}
    assert len(declarations)==len(config['mounts'])
    records=[];masked=set(config['linux'].get('maskedPaths',[]));readonly=set(config['linux'].get('readonlyPaths',[]))
    input_mount=next(m for m in state['Mounts'] if m['Destination']=='/input')
    def key(path):
        s=path.lstat();return (s.st_dev,s.st_ino,stat.S_IFMT(s.st_mode),stat.S_IMODE(s.st_mode))
    def object_match(target,source):
        assert source.startswith('/') and '..' not in Path(source).parts
        allowed=source==input_mount['Source'] or source.startswith(static+'/') or source.startswith(run+'/') or source in ['/dev/null','/dev/zero','/dev/full','/dev/tty','/dev/random','/dev/urandom'] or source=='/run/user/1000/containers/libpod/tmp/'+cid
        assert allowed,'source outside exact suite/container allowlist: '+source
        a=hostroot/target.lstrip('/');b=source_root/source.lstrip('/')
        assert not b.is_symlink(),'source is symlink'
        assert key(a)==key(b),'source/target inode or mode mismatch'
        result={'host_source':source,'source_namespace':'correlated conmon root','object_key':list(key(a))}
        if stat.S_ISREG(a.lstat().st_mode):
            x=a.read_bytes();y=b.read_bytes();assert len(x)<=65536 and x==y
            result['content_sha256']=hashlib.sha256(x).hexdigest()
        return result
    for target,mount in mounts.items():
        row={'target':target,'status':'VERIFIED','method':None,'source':mount['source'],'root':mount['root']}
        try:
            if target=='/':
                graph=state['GraphDriver']['Data'];assert config['root']['readonly'] is True and config['root']['path']==graph['MergedDir']
                opts=dict(x.split('=',1) for x in mount['super_options'] if '=' in x)
                assert opts['upperdir']==graph['UpperDir'] and opts['workdir']==graph['WorkDir']
                canonical=lambda value:[str((source_root/x.lstrip('/')).resolve(strict=True)) for x in value.split(':')]
                assert canonical(opts['lowerdir'])==canonical(graph['LowerDir'])
                assert mount['root']=='/' and mount['filesystem']=='overlay' and state['Image'].startswith('sha256:')
                row.update(method='OCI root plus engine graph paths and canonical lower layers',image=state['Image'],graph=graph)
            elif target in masked:
                meta=snapshot['mount_metadata'][target]
                if meta['type']=='character':
                    null=snapshot['device_metadata']['/dev/null'];assert (meta['major'],meta['minor'])==(1,3) and (meta['inode'],meta['device'])==(null['inode'],null['device']) and 'ro' in mount['vfs_flags']
                    row['method']='OCI maskedPath bound to exact read-only null object'
                else:
                    assert meta['type']=='directory' and mount['root']=='/crun/.empty-directory' and not list((hostroot/target.lstrip('/')).iterdir()) and 'ro' in mount['vfs_flags']
                    row['method']='OCI maskedPath empty read-only runtime mask'
            elif target in readonly:
                assert 'ro' in mount['vfs_flags'] and mount['filesystem']=='proc' and mount['root']==target.removeprefix('/proc')
                row['method']='OCI readonlyPath submount in target proc namespace'
            elif target in declarations:
                declaration=declarations[target];kind=declaration['type'];source=declaration['source'];row['oci_mount']=declaration
                if kind=='bind':
                    row.update(object_match(target,source));row['method']='exact OCI source and independent inode/content parity'
                    if target=='/input':assert input_mount['RW'] is False and source==input_mount['Source']
                    if target=='/run/secrets':assert not list((hostroot/target.lstrip('/')).iterdir())
                elif kind in ['tmpfs','proc','sysfs','devpts','mqueue']:
                    assert kind==mount['filesystem'] and mount['root']=='/'
                    row['method']='OCI kernel mount kind, target namespace and exact root'
                    if kind=='proc':assert os.readlink(hostroot/'proc/1/ns/pid')==snapshot['oracle']['namespaces']['pid']
                    if kind in ['mqueue','devpts']:assert snapshot['oracle']['namespaces']['mnt']!=snapshot['oracle']['observer_namespaces']['mnt']
                elif kind in ['cgroup','cgroup2']:
                    membership=next(x.split(':',2)[2] for x in snapshot['oracle']['membership'].splitlines() if x.startswith('0::'))
                    assert mount['filesystem']=='cgroup2' and mount['root']==membership and 'ro' in mount['vfs_flags']
                    row['method']='OCI cgroup mount bound to independently correlated target cgroup'
                else:raise AssertionError('unreviewed OCI mount type '+kind)
            elif target in ['/dev/null','/dev/zero','/dev/full','/dev/tty','/dev/random','/dev/urandom']:
                devices={x['path']:x for x in config['linux'].get('devices',[])};declared=devices[target];meta=snapshot['device_metadata'][target]
                assert declared['type']=='c' and (declared['major'],declared['minor'])==(meta['major'],meta['minor'])
                row.update(object_match(target,target));row['method']='OCI character-device declaration plus exact host device inode'
            else:raise AssertionError('mount has no matching OCI declaration/mask')
        except (OSError,KeyError,AssertionError,ValueError) as error:row.update(status='ERROR',reason=str(error))
        records.append(row)
    errors=[r for r in records if r['status']!='VERIFIED']
    return {'schema':1,'container_id':cid,'host_pid':pid,'conmon_pid':conmon,'oci_config_sha256':hashlib.sha256(raw).hexdigest(),'oci_config':config,'records':records,'verified_count':len(records)-len(errors),'verdict':'VERIFIED' if not errors else 'ERROR','errors':errors,'runtime_verified':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('parser');p.add_argument('input',type=Path);p.add_argument('sha256');a=p.parse_args()
    raw=a.input.read_bytes();assert hashlib.sha256(raw).hexdigest()==a.sha256
    print(json.dumps(collect(json.loads(raw),load_module(a.parser,'mount_parser'))))
