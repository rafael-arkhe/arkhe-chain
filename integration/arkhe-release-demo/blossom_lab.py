"""Bounded, unauthenticated LOOPBACK-ONLY Blossom fixture, never a public service."""
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import threading
import time


class LabStore:
    def __init__(self, root, port=0):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=False)
        self.events = []
        store = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def blob(self):
                match = re.fullmatch(r'/([0-9a-f]{64})(?:\.[a-z0-9]+)?', self.path)
                return store.root / match[1] if match else None

            def do_HEAD(self):
                self.do_GET(head=True)

            def do_GET(self, head=False):
                path = self.blob()
                store.events.append({'method': 'HEAD' if head else 'GET', 'path': self.path, 'time': time.time()})
                if path is None or not path.is_file():
                    self.send_error(404)
                    return
                data = path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Content-Type', 'application/octet-stream')
                self.end_headers()
                if not head:
                    self.wfile.write(data)

            def do_PUT(self):
                if self.path != '/upload':
                    self.send_error(404)
                    return
                self.connection.settimeout(10)
                length = int(self.headers.get('Content-Length', '-1'))
                if not 0 <= length <= 4 * 1024 * 1024:
                    self.send_error(413)
                    return
                data = self.rfile.read(length)
                if len(data) != length:
                    self.send_error(400)
                    return
                digest = hashlib.sha256(data).hexdigest()
                (store.root / digest).write_bytes(data)
                store.events.append({'method': 'PUT', 'sha256': digest, 'size': length})
                reply = json.dumps({'url': store.url + '/' + digest, 'sha256': digest, 'size': length,
                                    'type': 'application/octet-stream', 'uploaded': int(time.time())}).encode()
                self.send_response(201)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)

        self.server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
