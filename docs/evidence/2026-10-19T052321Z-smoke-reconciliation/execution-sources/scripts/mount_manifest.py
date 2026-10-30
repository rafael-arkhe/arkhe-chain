"""Pure mountinfo parsing and structural checks; never promotes a final seal."""
import re

def unescape(value):
    if re.search(r'\\(?![0-7]{3})',value):raise ValueError('invalid mountinfo escape')
    return re.sub(r'\\([0-7]{3})',lambda m:chr(int(m[1],8)),value)

def parse_mountinfo(text):
    rows={}
    for line in text.splitlines():
        a,b=line.split(' - ',1);left=a.split();right=b.split()
        if len(left)<6 or len(right)<3:raise ValueError('malformed mountinfo')
        target=unescape(left[4]);flags=left[5].split(',')
        if target in rows or not target.startswith('/') or ('ro' in flags)==('rw' in flags):raise ValueError('duplicate/invalid mount target or access')
        rows[target]={'id':int(left[0]),'parent_id':int(left[1]),'device':left[2],'root':unescape(left[3]),'target':target,'vfs_flags':flags,'optional':left[6:],'filesystem':right[0],'source':unescape(right[1]),'super_options':right[2].split(',')}
    return rows

def size_bytes(options):
    value=next((x.split('=',1)[1] for x in options if x.startswith('size=')),None)
    if value is None:return None
    match=re.fullmatch(r'(\d+)([kKmMgG]?)',value)
    if not match:raise ValueError('unknown size representation')
    return int(match[1])*{'':1,'k':1024,'m':1024**2,'g':1024**3}[match[2].lower()]

def compare(spec,snapshot):
    mounts=parse_mountinfo(snapshot['oracle']['mountinfo']);issues=[]
    expected={m['target']:m for m in spec['mounts']}
    for target in sorted(set(mounts)^set(expected)):issues.append({'kind':'MOUNT_SET_MISMATCH','target':target})
    for target,rule in expected.items():
        if target not in mounts:continue
        actual=mounts[target]
        if actual['filesystem']!=rule['filesystem']:issues.append({'kind':'FILESYSTEM_MISMATCH','target':target,'actual':actual['filesystem']})
        missing=set(rule['required_vfs_flags'])-set(actual['vfs_flags'])
        forbidden=set(rule['forbidden_vfs_flags'])&set(actual['vfs_flags'])
        if missing or forbidden:issues.append({'kind':'VFS_FLAGS_MISMATCH','target':target,'missing':sorted(missing),'forbidden':sorted(forbidden)})
        if any(x.startswith(('shared:','master:','propagate_from:')) for x in actual['optional']):issues.append({'kind':'PROPAGATION_MISMATCH','target':target})
        if 'tmpfs_size_bytes' in rule and size_bytes(actual['super_options'])!=rule['tmpfs_size_bytes']:issues.append({'kind':'TMPFS_SIZE_MISMATCH','target':target,'actual':size_bytes(actual['super_options'])})
        if target not in snapshot['mount_metadata'] or 'error' in snapshot['mount_metadata'][target]:issues.append({'kind':'MOUNT_METADATA_UNAVAILABLE','target':target})
    nodes=snapshot['device_metadata'];expected_nodes={n['path']:n for n in spec['devices']}
    for path in sorted(set(nodes)-set(expected_nodes)-set(spec['device_policy']['allowed_directories'])):issues.append({'kind':'UNEXPECTED_DEVICE_ENTRY','target':path})
    for path,rule in expected_nodes.items():
        actual=nodes.get(path,{})
        if actual.get('type')!=rule['type']:issues.append({'kind':'NODE_TYPE_MISMATCH','target':path,'actual':actual});continue
        fields={'required_mode':'mode','required_uid_inside':'uid_inside','required_gid_inside':'gid_inside','required_target':'target','major':'major','minor':'minor'}
        for expected_key,actual_key in fields.items():
            if expected_key in rule and rule[expected_key]!=actual.get(actual_key):issues.append({'kind':'NODE_METADATA_MISMATCH','target':path,'field':actual_key,'expected':rule[expected_key],'actual':actual.get(actual_key)})
    for key in ['shm_entries','mqueue_entries']:
        if snapshot.get(key):issues.append({'kind':'NONEMPTY_IPC_PREFLIGHT','target':key})
    return {'verdict':'FAIL' if issues else 'STRUCTURAL_MATCH_BINDINGS_PENDING','issues':issues,'final_manifest_eligible':False,'source_binding_review_required':True,'note':'Structural comparison only: every source/root/inode and mask binding still requires independent resolution. No auto-learning or final hash promotion.'}
