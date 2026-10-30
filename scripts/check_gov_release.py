"""Fail closed: no native government or hardware qualification is available in this cycle."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def validate(policy):
    if set(policy.get('bridges',{}))!={'icp-brasil-cms','cin-vio'}:
        raise ValueError('both credential profiles must be explicit')
    for name,bridge in policy['bridges'].items():
        if bridge.get('enabled') is not False:
            raise ValueError(name+': native verifier qualification pending')
    if policy.get('level3',{}).get('enabled') is not False:
        raise ValueError('TEE promotion blocked until platform, native roots and evidence are qualified')
    if policy.get('publicRekor',{}).get('enabled') is not False:
        raise ValueError('public Rekor is prepare-only in this cycle')
def main():
    validate(json.loads((ROOT/'config/gov-security.json').read_text(encoding='utf-8-sig')))
    print('PASS native CIN/CMS, level 3 and public publication remain blocked')
if __name__=='__main__':main()
