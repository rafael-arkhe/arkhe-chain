"""Selection capability control with supplied typed programs, maximum four calls."""
from run_python_frontend_smoke import main
from typed_candidate_bank import bank,response_schema,CandidateBankProposer


if __name__=='__main__':
    main(output_name='arc3-candidate-bank-smoke-20261027',adapter_factory=CandidateBankProposer,
        response_schema_fn=response_schema,
        report_metadata={'design':'Finite supplied-hypothesis selection on known controls, not free synthesis or controlled comparison with source generation.',
            'source_language':'Candidate ID only; hand-specified programs already typed.','candidate_bank':bank()})
