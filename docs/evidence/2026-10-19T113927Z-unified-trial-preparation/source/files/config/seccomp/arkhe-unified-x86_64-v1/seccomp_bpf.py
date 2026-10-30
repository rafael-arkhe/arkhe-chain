"""Bounded interpreter for offline libseccomp classic BPF; no kernel execution."""
import struct

def decide(program,number,args=(0,0,0,0,0,0),arch=0xc000003e):
    if not program or len(program)%8 or len(program)>4096*8:raise ValueError('invalid BPF length')
    instructions=list(struct.iter_unpack('<HBBI',program))
    data=struct.pack('<IIQ6Q',number&0xffffffff,arch,0,*args)
    pc=0;accumulator=0
    for _ in range(len(instructions)+1):
        if not 0<=pc<len(instructions):raise ValueError('invalid program counter')
        code,jt,jf,k=instructions[pc]
        if code==0x20:
            if k%4 or k+4>len(data):raise ValueError('out of bounds load')
            accumulator=struct.unpack_from('<I',data,k)[0];pc+=1
        elif code==0x54:accumulator&=k;pc+=1
        elif code in (0x15,0x25,0x35,0x45):
            test={0x15:accumulator==k,0x25:accumulator>k,0x35:accumulator>=k,0x45:bool(accumulator&k)}[code]
            pc+=1+(jt if test else jf)
        elif code==0x05:pc+=1+k
        elif code==0x06:return k
        else:raise ValueError('unsupported BPF instruction: '+hex(code))
    raise ValueError('instruction budget exceeded')
