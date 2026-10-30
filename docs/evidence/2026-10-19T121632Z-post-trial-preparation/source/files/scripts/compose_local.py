"""Run podman-compose with its Windows drive-letter context detection corrected.

podman-compose 1.5 treats C:\\... as a Git URL and drops the Dockerfile argument.
Keep the provider intact; adapt only this process's context classifier.
"""
import os
import podman_compose

original = podman_compose.is_context_git_url

def is_context_git_url(path):
    if os.name == 'nt' and len(path) > 2 and path[1] == ':' and path[0].isalpha():
        return False
    return original(path)

podman_compose.is_context_git_url = is_context_git_url
if __name__ == '__main__':
    podman_compose.main()
