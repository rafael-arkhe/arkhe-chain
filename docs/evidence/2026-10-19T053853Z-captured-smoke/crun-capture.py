#!/usr/bin/python3
import os,sys,re
from pathlib import Path
args=sys.argv[1:]
if 'create' not in args and 'run' not in args:os.execv('/usr/sbin/crun',['/usr/sbin/crun',*args])
container=args[-1]
if not re.fullmatch('[0-9a-f]{64}',container):raise SystemExit('invalid suite container ID')
os.umask(0o077)
p=Path('/home/user/.local/state/arkhe-containment/runtime-traces/c1dbce59-833c-436c-8b97-5ebbb9cb2fd0')/container;p.mkdir(parents=True,exist_ok=False)
os.execv(S'/home/user/.local/state/arkhe-containment/runtime-traces/c1dbce59-833c-436c-8b97-5ebbb9cb2fd0',[S'/home/user/.local/state/arkhe-containment/runtime-traces/c1dbce59-833c-436c-8b97-5ebbb9cb2fd0','--daemonize=grandchild','-ff','-ttt','-v','-s','65535','-X','raw','-e','trace=seccomp,prctl','-o',str(p/'trace'),'/usr/sbin/crun',*args])
