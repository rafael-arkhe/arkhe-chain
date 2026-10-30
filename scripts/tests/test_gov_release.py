import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from check_gov_release import validate
class GovReleaseTests(unittest.TestCase):
    def setUp(self):
        self.policy=json.loads((Path(__file__).resolve().parents[2]/'config/gov-security.json').read_text(encoding='utf-8-sig'))
    def test_each_native_bridge_and_hardware_promotion_fail_closed(self):
        for profile in ['icp-brasil-cms','cin-vio']:
            value=copy.deepcopy(self.policy);value['bridges'][profile]['enabled']=True
            with self.assertRaises(ValueError):validate(value)
        for name in ['level3','publicRekor']:
            value=copy.deepcopy(self.policy);value[name]['enabled']=True
            with self.assertRaises(ValueError):validate(value)
    def test_missing_profile_cannot_silently_remove_a_gate(self):
        value=copy.deepcopy(self.policy);del value['bridges']['cin-vio']
        with self.assertRaises(ValueError):validate(value)
if __name__=='__main__':unittest.main()
