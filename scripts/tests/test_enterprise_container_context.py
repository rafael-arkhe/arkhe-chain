import sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare_enterprise_container as context

class EnterpriseContextTests(unittest.TestCase):
    def test_source_context_excludes_runtime_accounts_keys_env_and_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'source';dest=Path(directory)/'context'
            app=root/'apps/arkhe-intra';app.mkdir(parents=True)
            for name in ['page.tsx','.env.production.local','owner.private.pem','accounts.json','credentials.json','intra.sqlite','secret.key']:
                (app/name).write_text('synthetic')
            (app/'node_modules').mkdir();(app/'node_modules/package.json').write_text('{}')
            with patch.object(context,'ROOT',root),patch.object(context,'DEST',dest):
                context.copy_tree('apps/arkhe-intra')
            self.assertEqual([path.relative_to(dest).as_posix() for path in dest.rglob('*') if path.is_file()],['apps/arkhe-intra/page.tsx'])

if __name__=='__main__':unittest.main()
