"""Two fixed synthetic witnesses of observable family insufficiency."""
import json
from pathlib import Path
from hidden_mechanics_micro import Episode, ACTIONS
from persistent_goal_pilot import public_map
from policy_contract_controls import Policy, FAMILY
from micro_evaluation_evidence import Writer, digest
from prospective_policy_step import step
from run_p0_greedy import RULE_IDS, CheckingWriter


class JumpWitness:
    """Evaluator-owned time-conditional dynamics, never supplied to learner."""
    def __init__(self, divergence_step):
        self.env = Episode(RULE_IDS[1], 43, 50)
        self.divergence_step = divergence_step

    def observe(self):
        return self.env.observe()

    def step(self, action):
        if self.env._steps + 1 != self.divergence_step:
            return self.env.step(action)
        if action not in ACTIONS:
            raise ValueError('ACTION_UNAVAILABLE')
        x, y = self.env._pos
        for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            dest = (x + dx, y + dy)
            if 0 <= dest[0] < 8 and 0 <= dest[1] < 8 and self.env._base[dest[1]][dest[0]] != 2:
                self.env._pos = dest
                self.env._steps += 1
                return self.env.observe()
        raise ValueError('NO_JUMP_WITNESS')


def core(writer, spec):
    writer.append({'event': 'manifest', 'digest': digest(spec)})
    cases = []
    for divergence in spec['divergence_steps']:
        policy = Policy(reset=True, reset_mode='selective', seed=1000)
        env = JumpWitness(divergence); before = env.observe(); base, _ = public_map(before)
        rows = []; outside = None
        for i in range(50):
            pos = next((x, y) for y, r in enumerate(before['grid']) for x, c in enumerate(r) if c in (1, 5))
            hypotheses_before = len(policy.mechanics)
            action = policy.choose_discriminative(base, pos)
            predicted = policy.predict(base, pos, action)
            after, result = step(writer, policy, env, base, before, action,
                                 digest(spec['source_digests']), f'jump-{divergence}')
            witness = Policy(reset=False); witness.mechanics = set(FAMILY)
            witness.observe(base, pos, action, after['grid'])
            family_explains = bool(witness.mechanics)
            label = 'COMPATIBLE' if policy.mechanics else 'NO_CURRENT_HYPOTHESIS'
            if not family_explains:
                label = 'OUTSIDE_FAMILY'
                if outside is None:
                    outside = i + 1
            row = {'step': i + 1, 'action': action, 'hypotheses_before': hypotheses_before,
                   'hypotheses_after': len(policy.mechanics), 'prediction_emitted': predicted is not None,
                   'exact': predicted is not None and predicted == after['grid'],
                   'family_explains_this_transition': family_explains, 'label': label,
                   'action_mode': 'FALLBACK' if hypotheses_before == 0 else 'A1'}
            writer.append({'event': 'case_diagnostic', 'divergence_step': divergence, **row})
            rows.append(row); before = after
        post = [r for r in rows if outside is not None and r['step'] > outside]
        cases.append({'divergence_step': divergence, 'first_outside': outside,
                      'delay_after_observable_divergence': None if outside is None else outside - divergence,
                      'premature_outside': sum(r['label'] == 'OUTSIDE_FAMILY' for r in rows[:divergence - 1]),
                      'post_detection_queries': len(post),
                      'post_detection_issued': sum(r['prediction_emitted'] for r in post),
                      'post_detection_fallback': sum(r['action_mode'] == 'FALLBACK' for r in post),
                      'first_singleton_step': next((r['step'] for r in rows if r['hypotheses_after'] == 1), None),
                      'terminal_reward': before['reward'], 'rows': rows})
    return {'cases': cases, 'actions': 100, 'final_head': writer.previous,
            'trust': 'Local unsigned synthetic controls; no sandbox, external authentication or novel primitive learning'}


def run(out):
    out = Path(out); out.mkdir(exist_ok=False); (out / 'sources').mkdir()
    names = ('run_e1_family.py', 'run_p0_greedy.py', 'hidden_mechanics_micro.py',
             'policy_contract_controls.py', 'micro_evaluation_evidence.py',
             'prospective_policy_step.py', 'persistent_goal_pilot.py')
    spec = {'format': 'E1_FIXED_WITNESSES_V1', 'divergence_steps': [1, 11],
            'layout_seed': 43, 'agent_seed': 1000, 'base_rule_id': RULE_IDS[1],
            'true_dynamics': 'one forced jump at declared step; otherwise original permutation',
            'jump': 'first endpoint-valid displacement in [(2,0),(-2,0),(0,2),(0,-2)]',
            'source_digests': {n: digest(Path(__file__).with_name(n).read_text()) for n in names}}
    (out / 'manifest.json').write_text(json.dumps(spec, indent=2))
    for name in names:
        (out / 'sources' / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    writer = Writer(out / 'events.jsonl')
    try:
        report = core(writer, spec)
    finally:
        writer.close()
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def verify(out):
    out = Path(out); spec = json.loads((out / 'manifest.json').read_text())
    for name, expected in spec['source_digests'].items():
        if digest(Path(__file__).with_name(name).read_text()) != expected or digest((out / 'sources' / name).read_text()) != expected:
            raise ValueError('SOURCE_MISMATCH')
    writer = CheckingWriter(out / 'events.jsonl'); report = core(writer, spec); writer.finish()
    if report != json.loads((out / 'report.json').read_text()):
        raise ValueError('REPORT_MISMATCH')
    return {'status': 'LOCAL_FULL_REPLAY_VERIFIED', 'actions': 100, 'cases': 2,
            'authentication': 'NOT_ESTABLISHED'}


if __name__ == '__main__':
    import sys
    if sys.argv[1] == 'verify':
        result = verify(sys.argv[2]); (Path(sys.argv[2]) / 'verification.json').write_text(json.dumps(result, indent=2))
    else:
        result = run(sys.argv[1]); result = [{k: v for k, v in c.items() if k != 'rows'} for c in result['cases']]
    print(json.dumps(result, indent=2))
