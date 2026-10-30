#!/usr/bin/python3
import os,sys,re
from pathlib import Path
args=sys.argv[1:]
if 'create' not in args and 'run' not in args:os.execv('/usr/sbin/crun',['/usr/sbin/crun',*args])
container=args[-1]
if not re.fullmatch('[0-9a-f]{64}',container):raise SystemExit('invalid suite container ID')
os.umask(0o077)
p=Path('/home/user/.local/state/arkhe-containment/runtime-traces/f05cf35d-e8d5-46d2-bdea-66509b28f1bf')/container;p.mkdir(parents=True,exist_ok=False)
os.execv('/opt/arkhe-containment/tools/strace-e85562be095c56fb89e58671cd9a3cd675499dfda78aac14cf32eb6ad8a6f0db',['/opt/arkhe-containment/tools/strace-e85562be095c56fb89e58671cd9a3cd675499dfda78aac14cf32eb6ad8a6f0db','--daemonize=grandchild','-ff','-ttt','-v','-s','65535','-X','raw','-e','trace=seccomp,prctl','-o',str(p/'trace'),'/usr/sbin/crun',*args])
