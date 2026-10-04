"""收集看点卡证据：README、顶层与二级目录、语言、最新 release、固定 commit。

用法：python authoring/collect_pick_evidence.py <输出目录> owner/repo ...
只读 GitHub API（使用本机 gh 登录态），每个仓库写一个 JSON。
"""
import base64
import json
import subprocess
import sys
from pathlib import Path


def gh(path: str):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)


def collect(repo: str) -> dict:
    meta = gh(f"repos/{repo}") or {}
    branch = meta.get("default_branch", "main")
    head = gh(f"repos/{repo}/commits/{branch}") or {}
    sha = head.get("sha", "")
    readme = gh(f"repos/{repo}/readme") or {}
    text = base64.b64decode(readme.get("content", "")).decode("utf-8", "replace") if readme else ""
    tree = gh(f"repos/{repo}/git/trees/{sha}?recursive=1") if sha else None
    paths = [t["path"] for t in (tree or {}).get("tree", []) if t["path"].count("/") <= 1]
    release = gh(f"repos/{repo}/releases/latest") or {}
    return {
        "repo": repo,
        "sha": sha,
        "description": meta.get("description"),
        "stars": meta.get("stargazers_count"),
        "language": meta.get("language"),
        "languages": gh(f"repos/{repo}/languages"),
        "license": (meta.get("license") or {}).get("spdx_id"),
        "created": meta.get("created_at"),
        "pushed": meta.get("pushed_at"),
        "release": {k: release.get(k) for k in ("tag_name", "published_at", "name")} if release else None,
        "tree_depth2": paths[:400],
        "tree_truncated": bool((tree or {}).get("truncated")),
        "readme": text[:14000],
        "readme_chars": len(text),
    }


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for repo in sys.argv[2:]:
        data = collect(repo)
        (out / (repo.replace("/", "--") + ".json")).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(repo, data["sha"][:7], data["readme_chars"], len(data["tree_depth2"]))
