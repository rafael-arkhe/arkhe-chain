#!/usr/bin/env python3
"""
Arkhe MMR Profile v1 independent reference generator.

This script imports no Arkhe Rust/WASM code and uses Python stdlib only.
It is a REVIEW/REGENERATION TOOL, not part of the CI conformance gate.
CI consumes tests/golden_vectors.json as immutable expected data.
"""
from __future__ import annotations
import json, struct
from pathlib import Path

IV=[0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19]
PERM=[2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8]
CS,CE,PARENT,ROOT=1,2,4,8
MASK=0xffffffff
def rotr(x,n): return ((x>>n)|(x<<(32-n)))&MASK
def g(s,a,b,c,d,x,y):
    s[a]=(s[a]+s[b]+x)&MASK; s[d]=rotr(s[d]^s[a],16)
    s[c]=(s[c]+s[d])&MASK; s[b]=rotr(s[b]^s[c],12)
    s[a]=(s[a]+s[b]+y)&MASK; s[d]=rotr(s[d]^s[a],8)
    s[c]=(s[c]+s[d])&MASK; s[b]=rotr(s[b]^s[c],7)
def rnd(s,m):
    g(s,0,4,8,12,m[0],m[1]);g(s,1,5,9,13,m[2],m[3]);g(s,2,6,10,14,m[4],m[5]);g(s,3,7,11,15,m[6],m[7])
    g(s,0,5,10,15,m[8],m[9]);g(s,1,6,11,12,m[10],m[11]);g(s,2,7,8,13,m[12],m[13]);g(s,3,4,9,14,m[14],m[15])
def words(b): return list(struct.unpack("<16I",b+b"\0"*(64-len(b))))
def comp(cv,m,c,bl,f):
    s=list(cv)+IV[:4]+[c&MASK,(c>>32)&MASK,bl,f];m=list(m)
    for i in range(7):
        rnd(s,m)
        if i!=6:m=[m[j] for j in PERM]
    return [((s[i]^s[i+8]) if i<8 else (s[i]^cv[i-8]))&MASK for i in range(16)]
class O:
    def __init__(self,cv,m,c,bl,f):self.cv,self.m,self.c,self.bl,self.f=cv,m,c,bl,f
    def cv8(self):return comp(self.cv,self.m,self.c,self.bl,self.f)[:8]
    def root(self):
        return b"".join(struct.pack("<I",w) for w in comp(self.cv,self.m,0,self.bl,self.f|ROOT))[:32]
def chout(ch,c):
    cv=IV.copy();n=max(1,(len(ch)+63)//64)
    for i in range(n):
        b=ch[i*64:(i+1)*64];f=(CS if i==0 else 0)
        if i==n-1:return O(cv,words(b),c,len(b),f|CE)
        cv=comp(cv,words(b),c,64,f)[:8]
def pout(l,r):return O(IV.copy(),list(l)+list(r),0,64,PARENT)
def b3(data):
    chunks=[data[i:i+1024] for i in range(0,len(data),1024)] or [b""]
    stack=[]
    for i,ch in enumerate(chunks[:-1]):
        cv=chout(ch,i).cv8();t=i+1
        while t&1==0:cv=pout(stack.pop(),cv).cv8();t>>=1
        stack.append(cv)
    out=chout(chunks[-1],len(chunks)-1)
    while stack:out=pout(stack.pop(),out.cv8())
    return out.root()
assert b3(b"").hex()=="af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
assert b3(b"abc").hex()=="6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85"

def size(n):return 2*n-n.bit_count()
def lh(x):return b3(b"\x00"+x)
def nh(l,r):return b3(b"\x01"+l+r)
def bh(l,r,n):return b3(b"\x02"+size(n).to_bytes(8,"big")+l+r)
def peak_sizes(n):
    out=[];bit=1<<(n.bit_length()-1);rem=n
    while bit:
        if rem>=bit:out.append(bit);rem-=bit
        bit>>=1
    return out
def tree_root_path(hashes,index):
    level=list(hashes);idx=index;steps=[]
    while len(level)>1:
        sib=idx^1
        steps.append(("node","left" if sib<idx else "right",level[sib]))
        level=[nh(level[i],level[i+1]) for i in range(0,len(level),2)]
        idx//=2
    return level[0],steps
def build(raw):
    hashes=[lh(x) for x in raw];peaks=[];start=0
    for width in peak_sizes(len(raw)):
        r,_=tree_root_path(hashes[start:start+width],0)
        peaks.append((start,width,r));start+=width
    return hashes,peaks
def root(raw):
    _,ps=build(raw)
    acc=ps[-1][2]
    for _,_,p in reversed(ps[:-1]):acc=bh(p,acc,len(raw))
    return acc
def proof(raw,idx):
    hashes,ps=build(raw)
    for pi,(start,width,p) in enumerate(ps):
        if start<=idx<start+width:break
    _,steps=tree_root_path(hashes[start:start+width],idx-start)
    if pi<len(ps)-1:
        acc=ps[-1][2]
        for _,_,p in reversed(ps[pi+1:-1]):acc=bh(p,acc,len(raw))
        steps.append(("bag","right",acc))
    for _,_,p in reversed(ps[:pi]):steps.append(("bag","left",p))
    return steps

if __name__=="__main__":
    for n in (1,3,4,5,7):
        raw=[i.to_bytes(32,"big") for i in range(1,n+1)]
        print(f"n={n} mmr_size={size(n)} root={root(raw).hex()}")
        for i in range(n):
            print(" ",i,[(k,d,h.hex()) for k,d,h in proof(raw,i)])
