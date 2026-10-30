//! Controlled probe transport. Observations are untrusted; never emits PASS.
//! Build and execute only in a suite-owned container. No external dependencies.
#[path = "network-wire.rs"]
mod network_wire;
use std::{env, fs, io, process::Command};
use std::io::Read;
use std::process::Stdio;
use std::time::{Duration, Instant};

const CASE_TABLE: &str = "/input/seccomp-cases";

extern "C" {
    fn syscall(number: std::os::raw::c_long, ...) -> std::os::raw::c_long;
}

const PROTOCOL: &str = "arkhe-containment-probe/v1";
const IDS: &[&str] = &[
    "identity",
    "cgroup-enforcement",
    "mount-inventory",
    "socket-local-control",
    "tcp-egress",
    "udp-egress",
    "dns-egress",
    "image-read-control",
    "writable-control",
    "input-read-control",
    "input-write",
    "image-write",
    "outside-mount-canary",
    "traversal-and-symlink",
    "subprocess-control",
    "ffi-control",
    "mount-capability",
    "seccomp-inventory",
    "tmp-noexec",
    "memory-bounded",
    "cpu-bounded",
    "pids-bounded",
];

fn quoted(text: &str) -> String {
    let mut result = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if c < '\u{20}' => result.push_str(&format!("\\u{:04x}", c as u32)),
            c => result.push(c),
        }
    }
    result.push('"');
    result
}

fn read_limited(path: &str) -> io::Result<String> {
    use std::io::Read;
    let mut text = String::new();
    fs::File::open(path)?
        .take(32769)
        .read_to_string(&mut text)?;
    if text.len() > 32768 {
        return Err(io::Error::other("observation exceeds limit"));
    }
    Ok(text)
}

fn read_table(path: &str) -> io::Result<String> {
    let mut data = Vec::new();
    fs::File::open(path)?.take(262145).read_to_end(&mut data)?;
    if data.len() > 262144 {
        return Err(io::Error::other("case table exceeds limit"));
    }
    String::from_utf8(data).map_err(|_| io::Error::other("case table is not UTF-8"))
}

#[derive(Clone)]
struct SeccompCase {
    id: String,
    rule_id: String,
    number: u64,
    expected: String,
    errno: i32,
    operands: [u64; 6],
    handling: String,
}

fn parse_case(line: &str) -> Result<SeccompCase, ProbeError> {
    let fields: Vec<&str> = line.splitn(13, '|').collect();
    if fields.len() != 13 {
        return Err("seccomp case table arity mismatch".into());
    }
    let mut operands = [0u64; 6];
    for (index, value) in operands.iter_mut().enumerate() {
        *value = fields[5 + index]
            .parse()
            .map_err(|_| ProbeError::from("seccomp case operand is not u64"))?;
    }
    Ok(SeccompCase {
        id: fields[0].into(),
        rule_id: fields[1].into(),
        number: fields[2]
            .parse()
            .map_err(|_| ProbeError::from("seccomp case number is not u64"))?,
        expected: fields[3].into(),
        errno: fields[4]
            .parse()
            .map_err(|_| ProbeError::from("seccomp case errno is not i32"))?,
        operands,
        handling: fields[11].into(),
    })
}

#[repr(C)]
struct KernelSigaction {
    handler: usize,
    flags: u64,
    restorer: usize,
    mask: u64,
}

#[repr(C)]
struct Timeval {
    seconds: i64,
    microseconds: i64,
}

#[repr(C)]
struct Itimerval {
    interval: Timeval,
    value: Timeval,
}

extern "C" fn noop_handler(_: i32) {}

#[cfg(target_arch = "x86_64")]
core::arch::global_asm!(
    ".global arkhe_signal_restorer",
    "arkhe_signal_restorer:",
    "mov rax, 15",
    "syscall",
    "mov rax, 231",
    "mov rdi, 99",
    "syscall",
);

#[cfg(target_arch = "x86_64")]
extern "C" {
    fn arkhe_signal_restorer();
}

fn install_handler(signal: i32) -> i32 {
    let action = KernelSigaction {
        handler: noop_handler as *const () as usize,
        flags: 0x0400_0000,
        restorer: arkhe_signal_restorer as *const () as usize,
        mask: 0,
    };
    let result = unsafe {
        syscall(
            13,
            signal as std::os::raw::c_long,
            &action as *const KernelSigaction,
            0,
            8,
        )
    };
    result as i32
}

fn arm_timer(microseconds: i64) -> i32 {
    let timer = Itimerval {
        interval: Timeval {
            seconds: 0,
            microseconds: 0,
        },
        value: Timeval {
            seconds: 0,
            microseconds,
        },
    };
    unsafe { syscall(38, 0, &timer as *const Itimerval, 0) as i32 }
}

fn raw_call(number: u64, operands: [u64; 6]) -> i64 {
    unsafe {
        syscall(
            number as std::os::raw::c_long,
            operands[0] as std::os::raw::c_long,
            operands[1] as std::os::raw::c_long,
            operands[2] as std::os::raw::c_long,
            operands[3] as std::os::raw::c_long,
            operands[4] as std::os::raw::c_long,
            operands[5] as std::os::raw::c_long,
        ) as i64
    }
}

fn errno_of(result: i64) -> i32 {
    if result == -1 {
        io::Error::last_os_error().raw_os_error().unwrap_or(0)
    } else {
        0
    }
}

fn emit_case(result: i64, errno: i32, exited: i32, signal: i32) {
    println!("r={} e={} x={} s={}", result, errno, exited, signal);
}

fn run_case(line: &str) -> Result<(), ProbeError> {
    let case = parse_case(line)?;
    match case.handling.as_str() {
        "exit" => {
            let result = raw_call(case.number, case.operands);
            emit_case(result, errno_of(result), 0, 0);
        }
        "fork" => {
            let result = raw_call(case.number, case.operands);
            if result == 0 {
                unsafe {
                    syscall(60, 0);
                }
            } else if result > 0 {
                let mut status: i32 = 0;
                unsafe {
                    syscall(61, result as std::os::raw::c_long, &mut status as *mut i32, 0, 0);
                }
            }
            emit_case(result, errno_of(result), 0, 0);
        }
        "pause" => {
            install_handler(14);
            arm_timer(20_000);
            let result = raw_call(case.number, case.operands);
            emit_case(result, errno_of(result), 0, 0);
        }
        "rt_sigsuspend" => {
            install_handler(14);
            arm_timer(20_000);
            let mask: u64 = 0;
            let result = unsafe {
                syscall(130, &mask as *const u64, 8) as i64
            };
            emit_case(result, errno_of(result), 0, 0);
        }
        "rt_sigreturn" => {
            install_handler(10);
            let result = unsafe {
                syscall(62, syscall(39), 10) as i64
            };
            emit_case(result, errno_of(result), 0, 0);
        }
        "i386" => {
            #[cfg(target_arch = "x86_64")]
            {
                use std::arch::asm;
                let result: i32;
                unsafe {
                    asm!(
                        "int 0x80",
                        inlateout("eax") 20 => result,
                        lateout("ecx") _,
                        lateout("edx") _,
                    );
                }
                emit_case(result as i64, if result < 0 { -result } else { 0 }, 0, 0);
            }
            #[cfg(not(target_arch = "x86_64"))]
            emit_case(-1, 38, 0, 0);
        }
        _ => {
            let result = raw_call(case.number, case.operands);
            emit_case(result, errno_of(result), 0, 0);
        }
    }
    Ok(())
}

fn parse_child_output(text: &str) -> (i64, i32, i32, i32) {
    let mut result = (-1, 0, 0, 0);
    for token in text.split_whitespace() {
        if let Some(value) = token.strip_prefix("r=") {
            result.0 = value.parse().unwrap_or(-1);
        } else if let Some(value) = token.strip_prefix("e=") {
            result.1 = value.parse().unwrap_or(0);
        } else if let Some(value) = token.strip_prefix("x=") {
            result.2 = value.parse().unwrap_or(0);
        } else if let Some(value) = token.strip_prefix("s=") {
            result.3 = value.parse().unwrap_or(0);
        }
    }
    result
}

fn seccomp_cases() -> Result<Option<String>, ProbeError> {
    use std::os::unix::process::ExitStatusExt;
    let table = read_table(CASE_TABLE).map_err(ProbeError::from)?;
    let status = read_limited("/proc/self/status").map_err(ProbeError::from)?;
    let field = |key: &str| {
        status
            .lines()
            .find_map(|line| line.strip_prefix(key))
            .unwrap_or("")
            .trim()
            .to_string()
    };
    let cases: Vec<SeccompCase> = table
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(parse_case)
        .collect::<Result<_, _>>()?;
    if cases.is_empty() || cases.len() > 2048 {
        return Err("seccomp case count is outside the reviewed range".into());
    }
    let mut entries = Vec::with_capacity(cases.len());
    let mut failures = Vec::new();
    for case in &cases {
        let line = table
            .lines()
            .find(|line| line.starts_with(&(case.id.clone() + "|")))
            .ok_or_else(|| ProbeError::from("seccomp case line vanished"))?;
        let mut child = Command::new("/proc/self/exe")
            .arg("--seccomp-case")
            .arg(line)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(ProbeError::from)?;
        let start = Instant::now();
        let state = loop {
            if let Some(state) = child.try_wait().map_err(ProbeError::from)? {
                break state;
            }
            if start.elapsed() > Duration::from_secs(2) {
                let _ = child.kill();
                break child.wait().map_err(ProbeError::from)?;
            }
            std::thread::sleep(Duration::from_millis(1));
        };
        let mut output = String::new();
        if let Some(stdout) = child.stdout.take() {
            stdout
                .take(4096)
                .read_to_string(&mut output)
                .map_err(ProbeError::from)?;
        }
        let (mut result, mut errno, mut exited, mut signal) = parse_child_output(&output);
        if let Some(code) = state.code() {
            if case.handling == "exit" && code == 42 {
                result = 42;
                errno = 0;
                exited = 42;
            } else if case.handling == "rt_sigreturn" && code == 99 {
                result = -1;
                errno = 1;
                exited = 99;
            }
        } else if let Some(number) = state.signal() {
            signal = number;
        }
        if case.expected == "ERRNO" && !(result == -1 && errno == case.errno) {
            failures.push(case.id.clone());
        }
        entries.push(format!(
            "{{\"id\":{},\"r\":{},\"e\":{},\"x\":{},\"s\":{}}}",
            quoted(&case.id),
            result,
            errno,
            exited,
            signal
        ));
    }
    let failure_json = failures.iter().take(16).map(|id| quoted(id)).collect::<Vec<_>>().join(",");
    Ok(Some(format!(
        "{{\"schema\":1,\"arch\":\"x86_64\",\"seccomp\":{},\"seccomp_filters\":{},\"no_new_privs\":{},\"cap_eff\":{},\"case_count\":{},\"cases\":[{}],\"precheck_failures\":[{}]}}",
        field("Seccomp:").parse::<u32>().unwrap_or(0),
        field("Seccomp_filters:").parse::<u32>().unwrap_or(0),
        field("NoNewPrivs:").parse::<u32>().unwrap_or(0),
        quoted(&field("CapEff:")),
        cases.len(),
        entries.join(","),
        failure_json
    )))
}

struct ProbeError {
    message: String,
    errno: Option<i32>,
}
impl From<io::Error> for ProbeError {
    fn from(error: io::Error) -> Self {
        Self {
            message: error.to_string(),
            errno: error.raw_os_error(),
        }
    }
}
impl From<&str> for ProbeError {
    fn from(message: &str) -> Self {
        Self {
            message: message.into(),
            errno: None,
        }
    }
}

fn guard(nonce: &str) -> Result<(), ProbeError> {
    if !cfg!(target_os = "linux") {
        return Err("Linux container required".into());
    }
    let status = read_limited("/proc/self/status").map_err(ProbeError::from)?;
    let field = |key: &str| {
        status
            .lines()
            .find_map(|line| line.strip_prefix(key))
            .unwrap_or("")
            .trim()
    };
    if field("Uid:").split_whitespace().next() != Some("10001")
        || field("NoNewPrivs:") != "1"
        || field("CapEff:") != "0000000000000000"
    {
        return Err("container identity guard failed".into());
    }
    let marker = read_limited("/input/arkhe-containment-fixture").map_err(ProbeError::from)?;
    if marker.trim() != nonce {
        return Err("suite-owned fixture guard failed".into());
    }
    Ok(())
}

fn event(name: &str, result: io::Result<String>) -> String {
    let (outcome, value, errno) = match result {
        Ok(value) => ("ok", value, None),
        Err(error) => ("error", error.to_string(), error.raw_os_error()),
    };
    format!(
        "{{\"case\":{},\"outcome\":{},\"value\":{},\"errno\":{}}}",
        quoted(name),
        quoted(outcome),
        quoted(&value),
        errno
            .map(|e| e.to_string())
            .unwrap_or_else(|| "null".into())
    )
}

fn write_existing(path: &str, value: &str) -> io::Result<String> {
    use std::io::Write;
    fs::OpenOptions::new()
        .write(true)
        .open(path)?
        .write_all(value.as_bytes())?;
    Ok("write-succeeded".into())
}

fn create_file(path: &str, value: &str) -> io::Result<String> {
    use std::io::Write;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?
        .write_all(value.as_bytes())?;
    Ok("create-succeeded".into())
}

fn roundtrip(path: &str, value: &str) -> io::Result<String> {
    create_file(path, value)?;
    let actual = read_limited(path)?;
    fs::remove_file(path)?;
    Ok(actual)
}

#[cfg(unix)]
fn filesystem_observe(vector: &str, nonce: &str) -> Result<Option<String>, ProbeError> {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let external = format!("/home/user/.local/state/arkhe-containment/fixtures/{nonce}/sentinel");
    let cases = match vector {
        "image-read-control" => vec![event("image-read", read_limited("/etc/debian_version"))],
        "writable-control" => vec![
            event(
                "tmp-roundtrip",
                roundtrip(&format!("/tmp/arkhe-control-{nonce}"), nonce),
            ),
            event(
                "work-roundtrip",
                roundtrip(&format!("/work/arkhe-control-{nonce}"), nonce),
            ),
        ],
        "input-write" => vec![
            event(
                "input-overwrite",
                write_existing("/input/arkhe-containment-sentinel", nonce),
            ),
            event(
                "input-create",
                create_file(&format!("/input/new-{nonce}"), nonce),
            ),
            event(
                "input-rename",
                fs::rename(
                    "/input/arkhe-containment-sentinel",
                    format!("/input/renamed-{nonce}"),
                )
                .map(|()| "rename-succeeded".into()),
            ),
        ],
        "image-write" => vec![
            event(
                "etc-create",
                create_file(&format!("/etc/arkhe-containment-{nonce}"), nonce),
            ),
            event(
                "root-create",
                create_file(&format!("/arkhe-containment-{nonce}"), nonce),
            ),
        ],
        "outside-mount-canary" => vec![
            event("outside-read", read_limited(&external)),
            event("outside-write", write_existing(&external, nonce)),
        ],
        "traversal-and-symlink" => {
            let inside = format!("/work/arkhe-link-inside-{nonce}");
            let outside = format!("/work/arkhe-link-outside-{nonce}");
            symlink("/input/arkhe-containment-sentinel", &inside)?;
            symlink(&external, &outside)?;
            let events = vec![
                event("inside-symlink-control", read_limited(&inside)),
                event(
                    "traversal-read",
                    read_limited(&format!("/input/../..{external}")),
                ),
                event("outside-symlink-read", read_limited(&outside)),
            ];
            fs::remove_file(inside)?;
            fs::remove_file(outside)?;
            events
        }
        "tmp-noexec" => {
            if fs::metadata("/bin/true")?.len() > 65536 {
                return Err("control executable exceeds budget".into());
            }
            let work = format!("/work/arkhe-exec-{nonce}");
            let tmp = format!("/tmp/arkhe-exec-{nonce}");
            fs::copy("/bin/true", &work)?;
            fs::copy("/bin/true", &tmp)?;
            fs::set_permissions(&work, fs::Permissions::from_mode(0o755))?;
            fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755))?;
            let execute = |path: &str| {
                Command::new(path)
                    .status()
                    .map(|status| format!("exit={:?}", status.code()))
            };
            let events = vec![
                event("work-exec-control", execute(&work)),
                event("tmp-exec", execute(&tmp)),
            ];
            fs::remove_file(work)?;
            fs::remove_file(tmp)?;
            events
        }
        _ => return Ok(None),
    };
    Ok(Some(format!("[{}]", cases.join(","))))
}

#[cfg(not(unix))]
fn filesystem_observe(_: &str, _: &str) -> Result<Option<String>, ProbeError> {
    Ok(None)
}

fn private_endpoint() -> io::Result<std::net::Ipv4Addr> {
    let text = read_limited("/input/network-endpoint")?;
    let address: std::net::Ipv4Addr = text
        .trim()
        .parse()
        .map_err(|_| io::Error::other("invalid fixture IP"))?;
    if !address.is_private() {
        return Err(io::Error::other("only private fixture addresses permitted"));
    }
    Ok(address)
}
fn network_exchange(
    protocol: &str,
    nonce: &str,
    address: std::net::Ipv4Addr,
) -> io::Result<String> {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream, UdpSocket};
    use std::time::Duration;
    let timeout = Duration::from_millis(400);
    if protocol == "tcp" {
        let mut stream = TcpStream::connect_timeout(&SocketAddr::from((address, 18080)), timeout)?;
        stream.set_read_timeout(Some(timeout))?;
        stream.set_write_timeout(Some(timeout))?;
        stream.write_all(nonce.as_bytes())?;
        let mut reply = [0u8; 64];
        stream.read_exact(&mut reply)?;
        if reply != nonce.as_bytes() {
            return Err(io::Error::other("echo mismatch"));
        }
    } else {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        socket.set_read_timeout(Some(timeout))?;
        socket.set_write_timeout(Some(timeout))?;
        let port = if protocol == "dns" { 15353 } else { 18081 };
        let request = if protocol == "dns" {
            network_wire::dns_query(nonce)
        } else {
            nonce.as_bytes().to_vec()
        };
        socket.send_to(&request, (address, port))?;
        let mut buffer = [0u8; 512];
        let (count, peer) = socket.recv_from(&mut buffer)?;
        let expected = if protocol == "dns" {
            network_wire::dns_reply(&request)
        } else {
            request
        };
        if peer != SocketAddr::from((address, port)) || buffer[..count] != expected {
            return Err(io::Error::other("fixture response mismatch"));
        }
    }
    Ok(format!("echo:{nonce}"))
}
fn loopback_control(nonce: &str) -> io::Result<String> {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream, UdpSocket};
    use std::time::Duration;
    let timeout = Some(Duration::from_millis(400));
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let mut client =
        TcpStream::connect_timeout(&listener.local_addr()?, Duration::from_millis(400))?;
    let (mut server, _) = listener.accept()?;
    client.set_read_timeout(timeout)?;
    client.set_write_timeout(timeout)?;
    server.set_read_timeout(timeout)?;
    server.set_write_timeout(timeout)?;
    client.write_all(nonce.as_bytes())?;
    let mut buf = [0u8; 64];
    server.read_exact(&mut buf)?;
    server.write_all(&buf)?;
    client.read_exact(&mut buf)?;
    if buf != nonce.as_bytes() {
        return Err(io::Error::other("local TCP mismatch"));
    }
    let receiver = UdpSocket::bind("127.0.0.1:0")?;
    let sender = UdpSocket::bind("127.0.0.1:0")?;
    receiver.set_read_timeout(timeout)?;
    sender.set_read_timeout(timeout)?;
    sender.send_to(nonce.as_bytes(), receiver.local_addr()?)?;
    let (n, peer) = receiver.recv_from(&mut buf)?;
    receiver.send_to(&buf[..n], peer)?;
    let (n, _) = sender.recv_from(&mut buf)?;
    if n != 64 || buf != nonce.as_bytes() {
        return Err(io::Error::other("local UDP mismatch"));
    }
    Ok(format!("tcp+udp:{nonce}"))
}
fn network_observe(vector: &str, nonce: &str) -> Result<Option<String>, ProbeError> {
    let cases = match vector {
        "socket-local-control" => vec![event("loopback", loopback_control(nonce))],
        "tcp-egress" | "udp-egress" | "dns-egress" => {
            let address = private_endpoint()?;
            let protocol = vector.split('-').next().unwrap();
            vec![event(
                "exchange",
                network_exchange(protocol, nonce, address),
            )]
        }
        _ => return Ok(None),
    };
    Ok(Some(format!("[{}]", cases.join(","))))
}

// Linux x86_64 only: fixed identity calls and isolated mount-family subchecks.
fn syscall_observe(vector: &str) -> Result<Option<String>, ProbeError> {
    if !cfg!(all(target_os = "linux", target_arch = "x86_64")) { return Ok(None); }
    extern "C" {
        fn getpid() -> i32;
        fn umount2(target: *const std::os::raw::c_char, flags: i32) -> i32;
        fn mount(source: *const std::os::raw::c_char, target: *const std::os::raw::c_char,
                 kind: *const std::os::raw::c_char, flags: std::os::raw::c_ulong,
                 data: *const std::ffi::c_void) -> i32;
    }
    match vector {
        "ffi-control" => {
            // SAFETY: fixed no-argument identity syscall numbers for Linux x86_64.
            let libc_pid = unsafe { getpid() };
            let raw_pid = unsafe { syscall(39) };
            let parent = unsafe { syscall(110) };
            let errno = if parent == -1 { io::Error::last_os_error().raw_os_error().unwrap_or(0) } else { 0 };
            Ok(Some(format!("{{\"arch\":\"x86_64\",\"rust_pid\":{},\"libc_pid\":{},\"raw_pid\":{},\"getppid\":{},\"getppid_errno\":{}}}",
                std::process::id(), libc_pid, raw_pid, parent, errno)))
        }
        "mount-capability" => {
            fs::create_dir("/work/suite-mount")?;
            fs::create_dir("/work/suite-unmount")?;
            fs::create_dir("/work/suite-pivot")?;
            fs::create_dir("/work/suite-pivot/old")?;
            // SAFETY: static NUL-terminated strings and fixed flags; paths are
            // fresh suite directories inside this mount namespace only.
            let mounted = unsafe { mount(b"tmpfs\0".as_ptr().cast(), b"/work/suite-mount\0".as_ptr().cast(),
                b"tmpfs\0".as_ptr().cast(), 14, b"size=16384\0".as_ptr().cast()) };
            let mount_errno = if mounted == -1 { io::Error::last_os_error().raw_os_error().unwrap_or(0) } else { 0 };
            // A non-mount directory: even an unexpectedly allowed syscall cannot
            // detach a real mount or a host path. EINVAL is not a passing denial.
            let unmounted = unsafe { umount2(b"/work/suite-unmount\0".as_ptr().cast(), 0) };
            let umount_errno = if unmounted == -1 { io::Error::last_os_error().raw_os_error().unwrap_or(0) } else { 0 };
            // Linux x86_64 pivot_root=155. new_root is a fresh non-mount directory;
            // this cannot switch roots even if a permission regression occurs.
            let pivoted = unsafe { syscall(155, b"/work/suite-pivot\0".as_ptr().cast::<std::os::raw::c_char>(),
                b"/work/suite-pivot/old\0".as_ptr().cast::<std::os::raw::c_char>()) };
            let pivot_errno = if pivoted == -1 { io::Error::last_os_error().raw_os_error().unwrap_or(0) } else { 0 };
            Ok(Some(format!(concat!(
                "{{\"schema\":2,\"arch\":\"x86_64\",\"cases\":[",
                "{{\"syscall\":\"mount\",\"number\":165,\"result\":{},\"errno\":{}}},",
                "{{\"syscall\":\"umount2\",\"number\":166,\"result\":{},\"errno\":{}}},",
                "{{\"syscall\":\"pivot_root\",\"number\":155,\"result\":{},\"errno\":{}}}]}}"),
                mounted, mount_errno, unmounted, umount_errno, pivoted, pivot_errno)))
        }
        _ => Ok(None),
    }
}

fn resource_observe(vector: &str) -> Result<Option<String>, ProbeError> {
    use std::time::{Duration, Instant};
    match vector {
        "memory-bounded" => {
            let mut chunks = Vec::new();
            for _ in 0..24 {
                let chunk = vec![0xabu8; 8 * 1024 * 1024];
                std::hint::black_box(&chunk);
                chunks.push(chunk);
                std::thread::sleep(Duration::from_millis(25));
            }
            std::hint::black_box(&chunks);
            Ok(Some("{\"allocated_bytes\":201326592}".into()))
        }
        "cpu-bounded" => {
            let start = Instant::now();
            let workers: Vec<_> = (0..2).map(|_| std::thread::spawn(|| {
                let until = Instant::now() + Duration::from_secs(3);
                let mut count = 0u64;
                while Instant::now() < until {
                    count = std::hint::black_box(count.wrapping_add(1));
                }
                count
            })).collect();
            let mut count = 0u64;
            for worker in workers { count += worker.join().map_err(|_| ProbeError::from("worker panic"))?; }
            Ok(Some(format!("{{\"threads\":2,\"elapsed_ms\":{},\"iterations\":{}}}", start.elapsed().as_millis(), count)))
        }
        "pids-bounded" => {
            let mut children = Vec::new();
            let mut denied = 0;
            let mut other = 0;
            for _ in 0..24 {
                match Command::new("/bin/sleep").arg("5").spawn() {
                    Ok(child) => children.push(child),
                    Err(error) if error.raw_os_error() == Some(11) => denied += 1,
                    Err(_) => other += 1,
                }
            }
            std::thread::sleep(Duration::from_millis(300));
            let spawned = children.len();
            for child in &mut children { let _ = child.kill(); }
            let mut reaped = 0;
            for child in &mut children { if child.wait().is_ok() { reaped += 1; } }
            Ok(Some(format!("{{\"attempts\":24,\"spawned\":{},\"eagain\":{},\"other_errors\":{},\"reaped\":{}}}", spawned, denied, other, reaped)))
        }
        _ => Ok(None),
    }
}

fn observe(vector: &str, nonce: &str) -> Result<Option<String>, ProbeError> {
    let read = |path: &str| read_limited(path).map_err(ProbeError::from);
    match vector {
        "memory-bounded" | "cpu-bounded" | "pids-bounded" => resource_observe(vector),
        "ffi-control" | "mount-capability" => syscall_observe(vector),
        "seccomp-inventory" if std::path::Path::new(CASE_TABLE).exists() => seccomp_cases(),
        "identity" | "seccomp-inventory" => read("/proc/self/status").map(Some),
        "mount-inventory" => read("/proc/self/mountinfo").map(Some),
        "cgroup-enforcement" => Ok(Some(format!(
            "memory.max={}\npids.max={}\ncpu.max={}",
            read("/sys/fs/cgroup/memory.max")?.trim(),
            read("/sys/fs/cgroup/pids.max")?.trim(),
            read("/sys/fs/cgroup/cpu.max")?.trim()
        ))),
        "subprocess-control" => {
            let status = Command::new("/bin/true")
                .status()
                .map_err(ProbeError::from)?;
            Ok(Some(format!("child_exit={:?}", status.code())))
        }
        "input-read-control" => read("/input/arkhe-containment-sentinel").map(Some),
        // The remaining vectors require independent oracles or bounded stress
        // supervision that this transport alone cannot provide.
        "socket-local-control" | "tcp-egress" | "udp-egress" | "dns-egress" => {
            network_observe(vector, nonce)
        }
        _ => filesystem_observe(vector, nonce),
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() == 3 && args[1] == "--seccomp-case" {
        if let Err(error) = run_case(&args[2]) {
            eprintln!("{}", error.message);
            std::process::exit(3);
        }
        return;
    }
    if args.len() != 3
        || !IDS.contains(&args[1].as_str())
        || args[2].len() != 64
        || !args[2]
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        eprintln!("usage: containment-probe <registered-vector-id> <64-lowercase-hex-nonce>");
        std::process::exit(2);
    }
    let (vector, nonce) = (&args[1], &args[2]);
    let result = guard(nonce).and_then(|()| observe(vector, nonce));
    let (state, observation, errno) = match result {
        Ok(Some(value)) => ("OBSERVED", value, None),
        Ok(None) => (
            "UNSUPPORTED",
            "probe requires executor/oracle implementation".into(),
            None,
        ),
        Err(error) => ("ERROR", error.message, error.errno),
    };
    println!(
        "{{\"protocol\":{},\"vector_id\":{},\"nonce\":{},\"state\":{},\"observations\":{},\"errno\":{}}}",
        quoted(PROTOCOL),
        quoted(vector),
        quoted(nonce),
        quoted(state),
        quoted(&observation),
        errno.map(|value| value.to_string()).unwrap_or_else(|| "null".into())
    );
}
