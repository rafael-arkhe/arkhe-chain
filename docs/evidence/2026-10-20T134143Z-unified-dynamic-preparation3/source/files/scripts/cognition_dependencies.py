"""Audit the resolved capability closure, independent of dependency aliases."""
from pathlib import Path

def audit_cognition_graph(metadata, approved, root):
    packages = {p["id"]: p for p in metadata["packages"]}
    nodes = {n["id"]: n for n in metadata["resolve"]["nodes"]}
    roots = [p["id"] for p in packages.values()
             if Path(p["manifest_path"]).parent.parent.name == "cognition"]
    errors = []
    seen = set()
    pending = list(roots)
    while pending:
        identity = pending.pop()
        if identity in seen:
            continue
        seen.add(identity)
        package = packages[identity]
        expected = approved.get(package["name"])
        actual = {"version": package["version"], "source": package.get("source")}
        if package.get("source") is None:
            try:
                actual["manifest"] = Path(package["manifest_path"]).resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                actual["manifest"] = "OUTSIDE_WORKSPACE"
        if expected != actual:
            errors.append("unapproved cognition dependency: " + package["name"])
        pending.extend(nodes[identity]["dependencies"])
    return errors

