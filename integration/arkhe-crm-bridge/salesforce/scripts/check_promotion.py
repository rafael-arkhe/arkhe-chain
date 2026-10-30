"""Fail closed if manual approval or exact-commit QA validation cannot be established."""
import json
import os
import urllib.request


def get(path):
    request=urllib.request.Request("https://api.github.com/"+path,headers={
        "Authorization":"Bearer "+os.environ["GITHUB_TOKEN"],"Accept":"application/vnd.github+json"})
    with urllib.request.urlopen(request,timeout=30) as response:
        return json.load(response)


def main():
    repo=os.environ["GITHUB_REPOSITORY"]
    sha=os.environ["GITHUB_SHA"]
    environment=os.environ["TARGET_ENVIRONMENT"]
    config=get(f"repos/{repo}/environments/{environment}")
    if not any(rule.get("type")=="required_reviewers" and rule.get("reviewers") for rule in config.get("protection_rules",[])):
        raise SystemExit("Target environment must have required reviewers configured in GitHub")
    runs=get(f"repos/{repo}/actions/workflows/salesforce-ci.yml/runs?head_sha={sha}&event=push&status=success&per_page=30")
    for run in runs.get("workflow_runs",[]):
        if run.get("head_branch")!="main" or run.get("head_sha")!=sha:
            continue
        jobs=get(f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100")
        if any(job.get("name")=="sandbox" and job.get("conclusion")=="success" for job in jobs.get("jobs",[])):
            print("Manual environment approval and exact-commit QA CI verified")
            return
    raise SystemExit("No successful main-branch QA sandbox job for this exact commit")


if __name__=="__main__": main()
