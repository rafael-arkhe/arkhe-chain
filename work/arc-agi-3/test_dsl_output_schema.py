import unittest,json
import jsonschema
from dsl_output_schema import schema,inspect_response
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as r
from dsl_proposal_loop import parse_response

class OutputSchemaTests(unittest.TestCase):
    def test_valid_schema_and_controls(self):
        s=schema();jsonschema.Draft202012Validator.check_schema(s)
        for ast in list(d.controls().values())+[r.memory_control()]:
            self.assertTrue(inspect_response(json.dumps({'uses_memory':True,'ast':ast}))['valid'])
    def test_missing_required_fields(self):
        self.assertFalse(inspect_response(json.dumps({'uses_memory':False,'ast':{'op':'var','name':'g'}}))['valid'])
        self.assertFalse(inspect_response(json.dumps({'uses_memory':False,'ast':{'op':'let','args':[d.var('g'),d.var('s')]}}))['valid'])
    def test_translate_four_args_not_three(self):
        ast=d.node('translate',d.var('g'),d.var('o'),d.lit(d.D,1),d.lit(d.D,0))
        self.assertTrue(inspect_response(json.dumps({'uses_memory':False,'ast':ast}))['valid'])
        ast['args'].pop();self.assertFalse(inspect_response(json.dumps({'uses_memory':False,'ast':ast}))['valid'])
    def test_coord_literal_array(self):
        ast=d.lit(d.C,(63,63));self.assertTrue(inspect_response(json.dumps({'uses_memory':False,'ast':ast}))['valid'])
        ast['value']=[64,64];self.assertFalse(inspect_response(json.dumps({'uses_memory':False,'ast':ast}))['valid'])
    def test_schema_not_typechecker(self):
        raw=json.dumps({'uses_memory':False,'ast':d.var('g')})
        self.assertTrue(inspect_response(raw)['valid'])
        with self.assertRaises(ValueError):parse_response(raw)
