import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_architecture import independent_paths,discover_crates

def crate(root,path,workspace=True,lock=True):
    (root/path).mkdir(parents=True,exist_ok=True)
    (root/path/'Cargo.toml').write_text('[package]\nname="x"\n'+('[workspace]\n' if workspace else ''))
    if lock:(root/path/'Cargo.lock').write_text('')

class IndependentWorkspaceTest(unittest.TestCase):
    def test_only_registered_self_contained_workspaces_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            crate(root,'integration/own');crate(root,'integration/own/crates/inner',workspace=False,lock=False)
            crate(root,'integration/member',workspace=False,lock=False)
            crate(root,'integration/stray',workspace=False,lock=False)
            registry={'independent_workspaces':[{'path':'integration/own','reason':'test'}]}
            excluded=independent_paths(root,registry,['integration/member'])
            # The registered subtree disappears; an unregistered crate stays visible to the gate.
            self.assertEqual(discover_crates(root,['integration'],excluded),{'integration/member','integration/stray'})

    def test_invalid_registrations_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            crate(root,'integration/nolock',lock=False)
            crate(root,'integration/nows',workspace=False)
            crate(root,'integration/parent');crate(root,'integration/parent/member',workspace=False,lock=False)
            cases=[('integration/nolock','x'),('integration/nows','x'),('integration/parent','x'),
                   ('../outside','x'),('integration/nows','')]
            for path,reason in cases:
                registry={'independent_workspaces':[{'path':path,'reason':reason}]}
                with self.assertRaises(ValueError,msg=path):
                    independent_paths(root,registry,['integration/parent/member'])
            # A separate repository absent from a clean checkout excludes nothing.
            registry={'independent_workspaces':[{'path':'integration/missing','reason':'x'}]}
            self.assertEqual(independent_paths(root,registry,[]),set())

if __name__=='__main__':unittest.main()
