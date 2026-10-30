import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_domains import check

def tree(root,sharing,registry_hex=None,implemented=False):
    (root/'Cargo.toml').write_text('[workspace]\nmembers=["a","b"]\n')
    for crate,literal in [('a','AKG:X:v1'),('b','AKG:X:v1'),('b','AKG:Y:v1')]:
        (root/crate/'src').mkdir(parents=True,exist_ok=True)
        with open(root/crate/'src'/'lib.rs','ab') as f:f.write(b'const D:&[u8]=b"'+literal.encode()+b'\\0";\n')
    (root/'config').mkdir(exist_ok=True)
    (root/'config/domain-sharing.json').write_text(json.dumps({'shared':sharing}))
    raw=b'AKG:Y:v1\0'
    entry={'object':'Y','ascii_literal':'AKG:Y:v1\\0','hex':registry_hex or raw.hex(),'length':len(raw)}
    for relative,entries in [('specs/akg/registry/domain-registry.json',[entry]),
                             ('specs/release/domain-registry.json',[dict(entry,object='Z',ascii_literal='AKG:Z:v1\\0',hex=b'AKG:Z:v1\0'.hex(),implementation='x')] if implemented else [])]:
        (root/relative).parent.mkdir(parents=True,exist_ok=True)
        (root/relative).write_text(json.dumps({'scope':'Release','domains':entries}))

SHARED=[{'domain':'AKG:X:v1','crates':['a','b'],'reason':'same object'}]

class DomainGateTest(unittest.TestCase):
    def run_check(self,**kw):
        with tempfile.TemporaryDirectory() as d:
            tree(Path(d),**kw);return check(Path(d))[0]

    def test_declared_sharing_passes(self):
        self.assertEqual(self.run_check(sharing=SHARED),[])

    def test_undeclared_reuse_fails(self):
        self.assertTrue(any('undeclared shared domain AKG:X:v1' in e for e in self.run_check(sharing=[])))

    def test_stale_declaration_fails(self):
        stale=SHARED+[{'domain':'AKG:Y:v1','crates':['b'],'reason':'x'}]
        self.assertTrue(any('stale' in e for e in self.run_check(sharing=stale)))

    def test_registry_hex_mismatch_fails(self):
        self.assertTrue(any('hex/length mismatch' in e for e in self.run_check(sharing=SHARED,registry_hex='00')))

    def test_implemented_but_unused_fails(self):
        self.assertTrue(any('implemented but unused: AKG:Z:v1' in e for e in self.run_check(sharing=SHARED,implemented=True)))

if __name__=='__main__':unittest.main()
