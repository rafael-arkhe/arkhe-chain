import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from mount_manifest import parse_mountinfo,compare,size_bytes
from vm_mount_snapshot import translate
class MountManifestTests(unittest.TestCase):
    def setUp(self):
        self.spec={'mounts':[{'target':'/tmp','filesystem':'tmpfs','required_vfs_flags':['rw','noexec'],'forbidden_vfs_flags':['ro'],'tmpfs_size_bytes':67108864}],'devices':[{'path':'/dev/null','type':'character','major':1,'minor':3,'required_mode':'0666','required_uid_inside':0}],'device_policy':{'allowed_directories':['/dev']}}
        self.snapshot={'oracle':{'mountinfo':'1 0 0:1 / /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=65536k\n'},'mount_metadata':{'/tmp':{'type':'directory'}},'device_metadata':{'/dev/null':{'type':'character','major':1,'minor':3,'mode':'0666','uid_inside':0}},'shm_entries':[],'mqueue_entries':[]}
    def issues(self):return compare(self.spec,self.snapshot)['issues']
    def test_structure_match_never_promotes_final(self):
        r=compare(self.spec,self.snapshot);self.assertEqual(r['verdict'],'STRUCTURAL_MATCH_BINDINGS_PENDING');self.assertFalse(r['final_manifest_eligible'])
    def test_missing_noexec_fails(self):
        self.snapshot['oracle']['mountinfo']=self.snapshot['oracle']['mountinfo'].replace(',noexec','');self.assertTrue(self.issues())
    def test_shared_mount_rejected(self):
        self.snapshot['oracle']['mountinfo']=self.snapshot['oracle']['mountinfo'].replace(' - ',' shared:1 - ');self.assertTrue(self.issues())
    def test_extra_mount_rejected(self):
        self.snapshot['oracle']['mountinfo']+='2 0 0:2 / /extra rw - tmpfs tmpfs rw\n';self.assertTrue(self.issues())
    def test_extra_device_rejected(self):
        self.snapshot['device_metadata']['/dev/danger']={'type':'character'};self.assertTrue(self.issues())
    def test_wrong_device_number_rejected(self):
        self.snapshot['device_metadata']['/dev/null']['minor']=5;self.assertTrue(self.issues())
    def test_host_uid_not_namespace_uid(self):
        self.assertEqual(translate(110000,'0 1000 1\n1 100000 65536\n'),10001);self.assertIsNone(translate(999999,'0 1000 1\n'))
    def test_duplicate_target_rejected(self):
        with self.assertRaises(ValueError):parse_mountinfo(self.snapshot['oracle']['mountinfo']*2)
    def test_escaped_path_decoded(self):
        r=parse_mountinfo('1 0 0:1 / /has\\040space ro - tmpfs tmpfs rw\n');self.assertIn('/has space',r)
    def test_malformed_escape_rejected(self):
        with self.assertRaises(ValueError):parse_mountinfo('1 0 0:1 / /bad\\wrong ro - tmpfs tmpfs rw\n')
    def test_invalid_access_rejected(self):
        with self.assertRaises(ValueError):parse_mountinfo('1 0 0:1 / /tmp ro,rw - tmpfs tmpfs rw\n')
    def test_size_units(self):self.assertEqual(size_bytes(['size=64m']),size_bytes(['size=65536k']))
    def test_wrong_size_fails(self):
        self.snapshot['oracle']['mountinfo']=self.snapshot['oracle']['mountinfo'].replace('65536k','1m');self.assertTrue(self.issues())
    def test_missing_metadata_blocks(self):
        self.snapshot['mount_metadata']['/tmp']={'error':'unreadable'};self.assertTrue(self.issues())
    def test_ro_vfs_on_rw_superblock_supported(self):
        self.spec['mounts'][0].update(required_vfs_flags=['ro','noexec'],forbidden_vfs_flags=['rw'])
        self.snapshot['oracle']['mountinfo']=self.snapshot['oracle']['mountinfo'].replace('/tmp rw,','/tmp ro,');self.assertFalse(self.issues())
    def test_nonempty_ipc_rejected(self):
        self.snapshot['shm_entries']=['unexpected'];self.assertTrue(self.issues())
    def prepare_guard(self):
        self.spec['devices'].append({'path':'/dev/core','type':'symlink','required_target':'/proc/kcore','link_target_guard':{'path':'/proc/kcore','type':'character','major':1,'minor':3,'requires_ro_mount':True,'same_object_as':'/dev/null'}})
        self.spec['mounts'].append({'target':'/proc/kcore','filesystem':'devtmpfs','required_vfs_flags':['ro'],'forbidden_vfs_flags':['rw']})
        self.snapshot['oracle']['mountinfo']+='2 0 0:2 /null /proc/kcore ro - devtmpfs none rw\n'
        self.snapshot['device_metadata']['/dev/core']={'type':'symlink','target':'/proc/kcore'}
        self.snapshot['device_metadata']['/dev/null'].update(inode=4,device=6)
        self.snapshot['mount_metadata']['/proc/kcore']={'type':'character','major':1,'minor':3,'inode':4,'device':6}
    def test_core_link_requires_same_null_object(self):
        self.prepare_guard();self.assertFalse(self.issues())
        self.snapshot['mount_metadata']['/proc/kcore']['inode']=99;self.assertTrue(self.issues())
    def test_core_link_to_real_proc_file_rejected(self):
        self.prepare_guard();self.snapshot['mount_metadata']['/proc/kcore']['type']='regular';self.assertTrue(self.issues())
    def test_core_mask_must_be_readonly(self):
        self.prepare_guard();self.snapshot['oracle']['mountinfo']=self.snapshot['oracle']['mountinfo'].replace('/proc/kcore ro','/proc/kcore rw');self.assertTrue(self.issues())
    def test_missing_mapping_classification_rejected(self):
        self.spec['devices'][0]['required_uid_mapping']='unmapped';self.assertTrue(self.issues())
    def test_unmapped_owner_must_match_host_identity(self):
        node=self.spec['devices'][0];node.pop('required_uid_inside');node.update(required_uid_mapping='unmapped',required_uid_host=0)
        self.snapshot['device_metadata']['/dev/null'].update(uid_mapping='unmapped',uid_host=0,uid_inside=None);self.assertFalse(self.issues())
        self.snapshot['device_metadata']['/dev/null']['uid_host']=1;self.assertTrue(self.issues())
if __name__=='__main__':unittest.main()
