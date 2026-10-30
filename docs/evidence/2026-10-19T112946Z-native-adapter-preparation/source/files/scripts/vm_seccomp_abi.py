"""Read the installed libseccomp x86_64 resolver; never load a filter or run probes."""
import argparse,ctypes,ctypes.util,hashlib,json,platform
from pathlib import Path
ARCH=0xc000003e

def collect(baseline):
    lib=ctypes.CDLL(ctypes.util.find_library('seccomp'));libc=ctypes.CDLL(None)
    lib.seccomp_arch_native.restype=ctypes.c_uint32
    if platform.machine()!='x86_64' or lib.seccomp_arch_native()!=ARCH:raise ValueError('Linux x86_64 resolver required')
    lib.seccomp_syscall_resolve_num_arch.argtypes=[ctypes.c_uint32,ctypes.c_int];lib.seccomp_syscall_resolve_num_arch.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name_arch.argtypes=[ctypes.c_uint32,ctypes.c_char_p];lib.seccomp_syscall_resolve_name_arch.restype=ctypes.c_int
    libc.free.argtypes=[ctypes.c_void_p]
    class Version(ctypes.Structure):_fields_=[('major',ctypes.c_uint),('minor',ctypes.c_uint),('micro',ctypes.c_uint)]
    lib.seccomp_version.restype=ctypes.POINTER(Version);version=lib.seccomp_version().contents
    rows=[]
    for number in range(1024):
        pointer=lib.seccomp_syscall_resolve_num_arch(ARCH,number)
        if not pointer:continue
        try:name=ctypes.string_at(pointer).decode('ascii')
        finally:libc.free(pointer)
        if lib.seccomp_syscall_resolve_name_arch(ARCH,name.encode())!=number:raise ValueError('resolver roundtrip mismatch')
        rows.append({'name':name,'number':number})
    names={n for r in baseline['syscalls'] for n in r['names']}
    names.update(['mount','umount2','pivot_root','fsopen','fsconfig','fsmount','move_mount','open_tree','mount_setattr','unshare','setns','ptrace','bpf','perf_event_open','keyctl','userfaultfd','getpid','getppid'])
    aliases={name:lib.seccomp_syscall_resolve_name_arch(ARCH,name.encode()) for name in sorted(names)}
    mapped={line.split()[-1] for line in Path('/proc/self/maps').read_text().splitlines() if '/libseccomp.so' in line}
    if len(mapped)!=1:raise ValueError('cannot identify resolver library')
    source=Path(next(iter(mapped)))
    return {'schema':1,'state':'RESOLVER_TABLE_NOT_KERNEL_AVAILABILITY_PROOF','architecture':'SCMP_ARCH_X86_64','audit_arch':ARCH,'enumeration_range':[0,1023],'x32_bit':0x40000000,'compatibility_abis_allowed':False,'library':{'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'version':f'{version.major}.{version.minor}.{version.micro}'},'kernel_release':platform.release(),'syscalls':rows,'baseline_name_resolution':aliases,'caveat':'Resolver symbols do not prove kernel availability. Negative numbers are non-native/pseudo syscalls, not native ABI entries. Unknown numbers use policy default action.'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);a=p.parse_args();print(json.dumps(collect(json.loads(a.baseline.read_text()))))
