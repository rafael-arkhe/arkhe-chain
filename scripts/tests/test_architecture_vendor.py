import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_architecture import vendor_paths,discover_crates

class VendorBoundaryTest(unittest.TestCase):
    def test_exact_vendor_only_and_active_siblings_remain_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            package='integrations/proof'
            vendor=package+'/output/reference'
            active='integrations/active'
            unexpected=package+'/output/new-active'
            for path in [vendor,vendor+'/nested',active,unexpected]:
                (root/path).mkdir(parents=True,exist_ok=True)
                (root/path/'Cargo.toml').write_text('[package]\nname="test"')
            registry={'node_packages':[package],'vendor_roots':[{'path':vendor,'reason':'external test reference','upstream':'https://example.org/reference'}]}
            vendors=vendor_paths(root,registry,[active])
            self.assertEqual(discover_crates(root,['integrations'],vendors),{active,unexpected})
            for invalid in [package+'/output',active,package+'/output/../..','../outside']:
                registry['vendor_roots'][0]['path']=invalid
                with self.assertRaises(ValueError):vendor_paths(root,registry,[active])
            registry['vendor_roots'][0]['path']=vendor
            with self.assertRaises(ValueError):vendor_paths(root,registry,[vendor+'/nested'])

if __name__=='__main__':unittest.main()
