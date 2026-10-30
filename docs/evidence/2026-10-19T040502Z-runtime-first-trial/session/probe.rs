//! Controlled probe transport. Observations are untrusted; never emits PASS.
//! Build and execute only in a suite-owned container. No external dependencies.
use std::{env, fs, io, process::Command};

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

fn observe(vector: &str) -> Result<Option<String>, ProbeError> {
    let read = |path: &str| read_limited(path).map_err(ProbeError::from);
    match vector {
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
        _ => Ok(None),
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
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
    let result = guard(nonce).and_then(|()| observe(vector));
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
