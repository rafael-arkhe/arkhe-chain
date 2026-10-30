"""Compile a native candidate with libseccomp and export BPF; never load it."""
import argparse,ctypes,ctypes.util,hashlib,json,os
from pathlib import Path
class Compare(ctypes.Structure):_fields_=[('arg',ctypes.c_uint),('op',ctypes.c_int),('a',ctypes.c_uint64),('b',ctypes.c_uint64)]

def compile_profile(profile,output):
    if profile.get('architectures')!=['SCMP_ARCH_X86_64'] or profile['defaultAction']!='SCMP_ACT_ERRNO':raise ValueError('native candidate only')
    lib=ctypes.CDLL(ctypes.util.find_library('seccomp'))
    lib.seccomp_arch_native.restype=ctypes.c_uint32
    if lib.seccomp_arch_native()!=0xc000003e:raise ValueError('native architecture mismatch')
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_release.argtypes=[ctypes.c_void_p]
    lib.seccomp_syscall_resolve_name_arch.argtypes=[ctypes.c_uint32,ctypes.c_char_p];lib.seccomp_syscall_resolve_name_arch.restype=ctypes.c_int
    lib.seccomp_rule_add_exact_array.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint,ctypes.POINTER(Compare)]
    lib.seccomp_export_bpf.argtypes=[ctypes.c_void_p,ctypes.c_int]
    lib.seccomp_export_pfc.argtypes=[ctypes.c_void_p,ctypes.c_int]
    ctx=lib.seccomp_init(0x50000|profile['defaultErrnoRet'])
    if not ctx:raise ValueError('context allocation failed')
    try:
        for rule in profile['syscalls']:
            if rule['action']=='SCMP_ACT_ALLOW':action=0x7fff0000
            elif rule['action']=='SCMP_ACT_ERRNO':action=0x50000|rule['errnoRet']
            else:raise ValueError('unsupported action')
            args=rule.get('args',[])
            comparisons=(Compare*len(args))(*(Compare(a['index'],{'SCMP_CMP_NE':1,'SCMP_CMP_EQ':4}[a['op']],a['value'],a['valueTwo']) for a in args))
            for name in rule['names']:
                number=lib.seccomp_syscall_resolve_name_arch(0xc000003e,name.encode())
                if number<0:raise ValueError('non-native name')
                code=lib.seccomp_rule_add_exact_array(ctx,action,number,len(args),comparisons)
                if code:raise ValueError(f'rule compilation failed: {name}: {code}')
        for suffix,export in [('.bpf',lib.seccomp_export_bpf),('.pfc',lib.seccomp_export_pfc)]:
            with output.with_suffix(suffix).open('xb') as f:
                if export(ctx,f.fileno())!=0:raise ValueError('filter export failed')
    finally:lib.seccomp_release(ctx)
    return {'state':'OFFLINE_COMPILED_NOT_LOADED','kernel_filter_loaded':False,'runtime_verified':False,'profile_sha256':hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest(),'bpf_sha256':hashlib.sha256(output.with_suffix('.bpf').read_bytes()).hexdigest(),'bpf_bytes':output.with_suffix('.bpf').stat().st_size,'compiler':'libseccomp exact-array native export; not evidence of crun-loaded filter'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('profile',type=Path);p.add_argument('output',type=Path);a=p.parse_args();print(json.dumps(compile_profile(json.loads(a.profile.read_text()),a.output)))
