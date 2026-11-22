"""Independent OS kernel filesystem observer (Linux inotify / Windows ReadDirectoryChangesW)."""
import ctypes
import multiprocessing as mp
import os
import select
import struct
import sys
import time


def _observer_main_linux(directory, channel):
    """Only the observer reads Linux kernel inotify events; never reads the executor journal."""
    libc = ctypes.CDLL(None, use_errno=True)
    fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
    watch = libc.inotify_add_watch(fd, os.fsencode(directory), 0x00000FFF)
    if fd < 0 or watch < 0:
        channel.send({"ready": False, "errno": ctypes.get_errno(), "backend": "linux_inotify"})
        return
    events, healthy = [], True

    def drain():
        nonlocal healthy
        while True:
            try:
                data = os.read(fd, 262144)
            except BlockingIOError:
                break
            offset = 0
            while offset < len(data):
                wd, mask, cookie, length = struct.unpack_from("iIII", data, offset)
                name = os.fsdecode(data[offset + 16 : offset + 16 + length].split(b"\0")[0])
                offset += 16 + length
                if mask & (0x4000 | 0x8000 | 0x2000 | 0x400 | 0x800):
                    healthy = False  # overflow, ignored, unmount, watched dir removal/move
                events.append(
                    {
                        "name": name,
                        "mask": mask,
                        "cookie": cookie,
                        "observed_monotonic_ns": time.monotonic_ns(),
                    }
                )

    channel.send({"ready": True, "pid": os.getpid(), "backend": "linux_inotify"})
    try:
        while True:
            readable, _, _ = select.select([fd, channel.fileno()], [], [], 1)
            if fd in readable:
                drain()
            if channel.fileno() in readable:
                command = channel.recv()
                drain()
                channel.send(
                    {
                        "healthy": healthy,
                        "backend": "linux_inotify",
                        "events": events,
                        "sample_monotonic_ns": time.monotonic_ns(),
                    }
                )
                if command == "stop":
                    break
    finally:
        os.close(fd)


def _observer_main_windows(directory, channel):
    """Independent Windows kernel observer via ReadDirectoryChangesW; never reads SQLite."""
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    FILE_LIST_DIRECTORY = 0x0001
    FILE_SHARE_READ = 0x00000001
    FILE_SHARE_WRITE = 0x00000002
    FILE_SHARE_DELETE = 0x00000004
    OPEN_EXISTING = 3
    FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
    FILE_FLAG_OVERLAPPED = 0x40000000
    INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value
    WAIT_OBJECT_0 = 0x00000000
    WAIT_TIMEOUT = 0x00000102
    ERROR_IO_PENDING = 997
    ERROR_NOTIFY_ENUM_DIR = 1022
    NOTIFY_FILTER = (
        0x00000001  # FILE_NOTIFY_CHANGE_FILE_NAME
        | 0x00000002  # FILE_NOTIFY_CHANGE_DIR_NAME
        | 0x00000004  # FILE_NOTIFY_CHANGE_ATTRIBUTES
        | 0x00000008  # FILE_NOTIFY_CHANGE_SIZE
        | 0x00000010  # FILE_NOTIFY_CHANGE_LAST_WRITE
        | 0x00000040  # FILE_NOTIFY_CHANGE_CREATION
    )

    ACTION_TO_MASK = {
        1: (0x100, "FILE_ACTION_ADDED"),  # IN_CREATE equivalent
        2: (0x200, "FILE_ACTION_REMOVED"),  # IN_DELETE equivalent
        3: (0x002, "FILE_ACTION_MODIFIED"),  # IN_MODIFY equivalent
        4: (0x040, "FILE_ACTION_RENAMED_OLD_NAME"),  # IN_MOVED_FROM equivalent
        5: (0x080, "FILE_ACTION_RENAMED_NEW_NAME"),  # IN_MOVED_TO equivalent
    }

    class OVERLAPPED(ctypes.Structure):
        _fields_ = [
            ("Internal", ctypes.c_void_p),
            ("InternalHigh", ctypes.c_void_p),
            ("Offset", wintypes.DWORD),
            ("OffsetHigh", wintypes.DWORD),
            ("hEvent", wintypes.HANDLE),
        ]

    kernel32.CreateFileW.restype = wintypes.HANDLE
    kernel32.CreateFileW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.c_void_p,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    kernel32.CreateEventW.restype = wintypes.HANDLE
    kernel32.CreateEventW.argtypes = [
        ctypes.c_void_p,
        wintypes.BOOL,
        wintypes.BOOL,
        wintypes.LPCWSTR,
    ]
    kernel32.ReadDirectoryChangesW.restype = wintypes.BOOL
    kernel32.ReadDirectoryChangesW.argtypes = [
        wintypes.HANDLE,
        ctypes.c_void_p,
        wintypes.DWORD,
        wintypes.BOOL,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(OVERLAPPED),
        ctypes.c_void_p,
    ]
    kernel32.GetOverlappedResult.restype = wintypes.BOOL
    kernel32.GetOverlappedResult.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(OVERLAPPED),
        ctypes.POINTER(wintypes.DWORD),
        wintypes.BOOL,
    ]
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel32.ResetEvent.restype = wintypes.BOOL
    kernel32.ResetEvent.argtypes = [wintypes.HANDLE]
    kernel32.CancelIoEx.restype = wintypes.BOOL
    kernel32.CancelIoEx.argtypes = [wintypes.HANDLE, ctypes.POINTER(OVERLAPPED)]
    kernel32.CloseHandle.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

    dir_handle = kernel32.CreateFileW(
        directory,
        FILE_LIST_DIRECTORY,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
        None,
    )
    if dir_handle == INVALID_HANDLE_VALUE:
        channel.send(
            {
                "ready": False,
                "winerror": ctypes.get_last_error(),
                "backend": "windows_read_directory_changes_w",
            }
        )
        return

    ev_handle = kernel32.CreateEventW(None, True, False, None)
    if not ev_handle:
        err = ctypes.get_last_error()
        kernel32.CloseHandle(dir_handle)
        channel.send(
            {
                "ready": False,
                "winerror": err,
                "backend": "windows_read_directory_changes_w",
            }
        )
        return

    buf_size = 65536
    buf = ctypes.create_string_buffer(buf_size)
    overlapped = OVERLAPPED()
    overlapped.hEvent = ev_handle
    bytes_returned = wintypes.DWORD(0)
    events = []
    healthy = True
    pending = False

    def issue_read():
        nonlocal healthy, pending
        kernel32.ResetEvent(ev_handle)
        overlapped.Internal = 0
        overlapped.InternalHigh = 0
        overlapped.Offset = 0
        overlapped.OffsetHigh = 0
        bytes_returned.value = 0
        ok = kernel32.ReadDirectoryChangesW(
            dir_handle,
            buf,
            buf_size,
            False,
            NOTIFY_FILTER,
            ctypes.byref(bytes_returned),
            ctypes.byref(overlapped),
            None,
        )
        if not ok:
            err = ctypes.get_last_error()
            if err != ERROR_IO_PENDING:
                healthy = False
                pending = False
                return False
        pending = True
        return True

    def parse_buffer(nbytes):
        nonlocal healthy
        if nbytes == 0:
            healthy = False  # Kernel notification buffer overflow
            return
        raw = buf.raw[:nbytes]
        offset = 0
        while offset < nbytes:
            next_off, action, name_len = struct.unpack_from("<III", raw, offset)
            name_bytes = raw[offset + 12 : offset + 12 + name_len]
            name = name_bytes.decode("utf-16-le", errors="replace")
            mask, action_name = ACTION_TO_MASK.get(action, (0, f"ACTION_{action}"))
            events.append(
                {
                    "name": name,
                    "mask": mask,
                    "win_action": action,
                    "win_action_name": action_name,
                    "cookie": 0,
                    "observed_monotonic_ns": time.monotonic_ns(),
                }
            )
            if next_off == 0:
                break
            offset += next_off

    def drain(wait_ms=0):
        nonlocal healthy, pending
        while pending:
            wait = kernel32.WaitForSingleObject(ev_handle, wait_ms)
            wait_ms = 0
            if wait == WAIT_TIMEOUT:
                break
            if wait != WAIT_OBJECT_0:
                healthy = False
                pending = False
                break
            transferred = wintypes.DWORD(0)
            ok = kernel32.GetOverlappedResult(
                dir_handle, ctypes.byref(overlapped), ctypes.byref(transferred), False
            )
            pending = False
            if not ok:
                err = ctypes.get_last_error()
                if err == ERROR_NOTIFY_ENUM_DIR:
                    healthy = False
                else:
                    healthy = False
                break
            parse_buffer(transferred.value)
            if not issue_read():
                break

    if not issue_read():
        kernel32.CloseHandle(ev_handle)
        kernel32.CloseHandle(dir_handle)
        channel.send(
            {
                "ready": False,
                "winerror": ctypes.get_last_error(),
                "backend": "windows_read_directory_changes_w",
            }
        )
        return

    channel.send(
        {
            "ready": True,
            "pid": os.getpid(),
            "backend": "windows_read_directory_changes_w",
        }
    )
    try:
        while True:
            drain(wait_ms=0)
            if channel.poll(0.01):
                command = channel.recv()
                # Allow any in-flight kernel notification queued before sample to settle.
                drain(wait_ms=20)
                channel.send(
                    {
                        "healthy": healthy,
                        "backend": "windows_read_directory_changes_w",
                        "events": events,
                        "sample_monotonic_ns": time.monotonic_ns(),
                    }
                )
                if command == "stop":
                    break
    finally:
        if pending:
            kernel32.CancelIoEx(dir_handle, ctypes.byref(overlapped))
        kernel32.CloseHandle(ev_handle)
        kernel32.CloseHandle(dir_handle)


def observer_main(directory, channel):
    if sys.platform.startswith("linux"):
        _observer_main_linux(directory, channel)
    elif os.name == "nt":
        _observer_main_windows(directory, channel)
    else:
        channel.send({"ready": False, "reason": f"unsupported_platform:{sys.platform}"})


class Observer:
    def __init__(self, directory):
        self.channel, child = mp.Pipe()
        self.process = mp.Process(target=observer_main, args=(str(directory), child))
        self.process.start()
        if not self.channel.poll(5):
            raise RuntimeError("observer startup timeout")
        startup = self.channel.recv()
        if not startup.get("ready"):
            raise RuntimeError(f"observer startup failed: {startup}")
        self.backend = startup.get("backend", "unknown")

    def snapshot(self):
        if not self.process.is_alive():
            return {
                "healthy": False,
                "backend": self.backend,
                "events": [],
                "reason": "observer_dead",
            }
        self.channel.send("sample")
        if not self.channel.poll(5):
            return {
                "healthy": False,
                "backend": self.backend,
                "events": [],
                "reason": "observer_timeout",
            }
        return self.channel.recv()

    def close(self):
        if self.process.is_alive():
            self.channel.send("stop")
            if self.channel.poll(5):
                self.channel.recv()
            self.process.join(5)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join(5)
        self.channel.close()
