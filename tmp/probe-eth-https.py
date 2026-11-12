import socket
import ssl

HOSTS = [
    "ethereum.publicnode.com",
    "rpc.ankr.com",
    "eth.llamarpc.com",
    "cloudflare-eth.com",
]
BODY = b'{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x1",false]}'


def probe(host, path):
    ctx = ssl.create_default_context()
    raw = socket.create_connection((host, 443), 10)
    tls = ctx.wrap_socket(raw, server_hostname=host)
    req = (
        f"POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\n"
        f"Content-Length: {len(BODY)}\r\nConnection: close\r\n\r\n"
    ).encode() + BODY
    tls.sendall(req)
    data = b""
    tls.settimeout(10)
    try:
        while True:
            chunk = tls.recv(4096)
            if not chunk:
                break
            data += chunk
            if len(data) > 2000:
                break
    except TimeoutError:
        data += b"\n[timeout]"
    print("HOST", host, "PATH", path, "BYTES", len(data))
    print(data[:800].decode("utf-8", "replace"))
    print("---")


if __name__ == "__main__":
    probe("ethereum.publicnode.com", "/")
    probe("rpc.ankr.com", "/eth")
    probe("eth.llamarpc.com", "/")
    probe("cloudflare-eth.com", "/")
