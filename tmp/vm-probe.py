import socket

body = '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x1",false]}'
req = (
    "POST / HTTP/1.1\r\n"
    "Host: 127.0.0.1:8545\r\n"
    "Content-Type: application/json\r\n"
    f"Content-Length: {len(body)}\r\n"
    "Connection: close\r\n\r\n"
    + body
)
s = socket.create_connection(("127.0.0.1", 8545), 5)
s.sendall(req.encode())
data = b""
while True:
    chunk = s.recv(4096)
    if not chunk:
        break
    data += chunk
print("BYTES", len(data))
print(data[:400].decode("utf-8", "replace"))
