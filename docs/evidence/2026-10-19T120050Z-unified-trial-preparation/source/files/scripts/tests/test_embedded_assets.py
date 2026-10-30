import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_embedded_assets import audit_crate
class EmbeddedAssetTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'src').mkdir()
 def test_unwatched_migration_directory_rejected(self):
  (self.root/'migrations').mkdir();(self.root/'src/lib.rs').write_text('sqlx::migrate!("migrations");')
  self.assertTrue(audit_crate(self.root)[0])
 def test_directory_watch_accepts_new_migration_files(self):
  (self.root/'migrations').mkdir();(self.root/'src/lib.rs').write_text('sqlx::migrate!("migrations");');(self.root/'build.rs').write_text('println!("cargo:rerun-if-changed=migrations");')
  (self.root/'migrations/new.sql').write_text('SELECT 1;');self.assertFalse(audit_crate(self.root)[0])
 def test_individual_file_watch_does_not_cover_new_migrations(self):
  (self.root/'migrations').mkdir();(self.root/'src/lib.rs').write_text('sqlx::migrate!("migrations");');(self.root/'build.rs').write_text('println!("cargo:rerun-if-changed=migrations/old.sql");')
  self.assertTrue(audit_crate(self.root)[0])
 def test_literal_include_uses_compiler_tracking_but_file_must_exist(self):
  (self.root/'src/lib.rs').write_text('include_str!("schema.json");');self.assertTrue(audit_crate(self.root)[0]);(self.root/'src/schema.json').write_text('{}')
  errors,counts=audit_crate(self.root);self.assertFalse(errors);self.assertEqual(counts['compiler_includes'],1)

 def test_nonliteral_asset_requires_an_explicit_audit_rule(self):
  (self.root/'src/lib.rs').write_text('include_str!(concat!("a", "b"));')
  self.assertTrue(audit_crate(self.root)[0])
