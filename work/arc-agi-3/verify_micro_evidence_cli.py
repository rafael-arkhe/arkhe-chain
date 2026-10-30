"""Offline local-chain verification and deterministic replay. No signature claim."""
import argparse,json,sys
from micro_evaluation_evidence import verify


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',help='Directory containing manifest, sources, events and checkpoint')
    args=parser.parse_args()
    try:print(json.dumps(verify(args.directory),indent=2))
    except (ValueError,OSError,KeyError,TypeError) as exc:
        print(json.dumps({'status':'VERIFICATION_FAILED','reason':str(exc)}));sys.exit(2)
