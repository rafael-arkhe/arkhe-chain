"""Fixed read-only metadata snapshot of one independently correlated suite target."""
import argparse,importlib.util,json,os,stat
from pathlib import Path

def translate(value,mapping):
    for line in mapping.splitlines():
        inside,outside,size=map(int,line.split())
        if outside<=value<outside+size:return inside+value-outside
    return None

def snapshot(observer,pid,container,spec):
    loader=importlib.util.spec_from_file_location('oracle',observer);module=importlib.util.module_from_spec(loader);loader.loader.exec_module(module)
    oracle=module.observe(pid,container);root=Path('/proc')/str(oracle['host_pid'])/'root'
    gid_map=(Path('/proc')/str(oracle['host_pid'])/'gid_map').read_text()
    def metadata(path):
        try:
            p=root/path.lstrip('/');s=p.lstat()
            kind='symlink' if stat.S_ISLNK(s.st_mode) else 'character' if stat.S_ISCHR(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'regular' if stat.S_ISREG(s.st_mode) else 'other'
            value={'type':kind,'mode':format(stat.S_IMODE(s.st_mode),'04o'),'uid_host':s.st_uid,'gid_host':s.st_gid,'uid_inside':translate(s.st_uid,oracle['uid_map']),'gid_inside':translate(s.st_gid,gid_map),'inode':s.st_ino,'device':s.st_dev}
            if kind=='character':value.update(major=os.major(s.st_rdev),minor=os.minor(s.st_rdev))
            if kind=='symlink':value['target']=os.readlink(p)
            return value
        except OSError as e:return {'error':str(e),'errno':e.errno}
    device_paths=set(x['path'] for x in spec['devices'])
    for directory in spec['device_policy']['allowed_directories']:
        device_paths.add(directory)
        device_paths.update(directory.rstrip('/')+'/'+p.name for p in (root/directory.lstrip('/')).iterdir())
    reader_status=Path('/proc/self/status').read_text();fields=dict(line.split(':',1) for line in reader_status.splitlines() if ':' in line)
    state='BLOCKED_READER_SECCOMP' if fields.get('Seccomp','').strip()!='0' else 'CAPTURE_NOT_IMPLEMENTED_FOR_THIS_READER'
    capture={'state':state,'kernel_bpf_captured':False,'ptrace_attempted':False,'observer_status':reader_status,'reason':'PTRACE_SECCOMP_GET_FILTER requires tracer without seccomp. No inherited restriction is disabled; offline BPF is not substituted.'}
    return {'oracle':oracle,'gid_map':gid_map,'mount_metadata':{x['target']:metadata(x['target']) for x in spec['mounts']},'device_metadata':{p:metadata(p) for p in sorted(device_paths)},'shm_entries':sorted(p.name for p in (root/'dev/shm').iterdir()),'mqueue_entries':sorted(p.name for p in (root/'dev/mqueue').iterdir()),'kernel_filter_capture':capture}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('observer');p.add_argument('pid',type=int);p.add_argument('container');p.add_argument('spec',type=Path);a=p.parse_args();print(json.dumps(snapshot(a.observer,a.pid,a.container,json.loads(a.spec.read_text())))))
