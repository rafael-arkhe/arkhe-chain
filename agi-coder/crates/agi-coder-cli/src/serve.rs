use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::time::Duration;

use serde::Deserialize;

const INDEX: &str = include_str!("../ui/index.html");
const CSS: &str = include_str!("../ui/console.css");
const JS: &str = include_str!("../ui/console.js");
const MAX_BODY: usize = 16 * 1024;

pub struct HttpResponse {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

struct RequestError {
    status: u16,
    message: String,
}

#[derive(Deserialize)]
struct GoalBody {
    goal: String,
}

pub fn parse_loopback(value: &str) -> Result<SocketAddr, String> {
    let addr: SocketAddr = value.parse().map_err(|_| {
        "bind address must be numeric loopback, for example 127.0.0.1:8791".to_string()
    })?;
    if !addr.ip().is_loopback() {
        return Err("operator UI binds to loopback only".into());
    }
    if addr.port() == 0 {
        return Err("choose an explicit port".into());
    }
    Ok(addr)
}

pub fn handle(
    method: &str,
    path: &str,
    body: &[u8],
    session: &mut crate::cockpit::Session,
) -> HttpResponse {
    if body.len() > MAX_BODY {
        return json_error(413, "request body is too large");
    }
    let path = path.split('?').next().unwrap_or(path);
    if path.contains("..") {
        return json_error(400, "path is not allowed");
    }
    match (method, path) {
        ("GET", "/" | "/index.html") => html(INDEX),
        ("GET", "/console.css") => text(200, "text/css; charset=utf-8", CSS),
        ("GET", "/console.js") => text(200, "text/javascript; charset=utf-8", JS),
        ("GET", "/api/status") => json_ok(&crate::ops::status()),
        ("GET", "/api/session") => json_ok(&session.view()),
        ("POST", "/api/plan") => recorded(session, "plan", "pass", goal(body, crate::ops::plan)),
        ("POST", "/api/demo") => recorded(
            session,
            "demo",
            "inconclusive",
            goal(body, crate::ops::run_demo),
        ),
        ("POST", "/api/bitflip") => recorded(
            session,
            "bitflip",
            "fail",
            json_ok(&crate::ops::bitflip_report()),
        ),
        ("POST", "/api/grid") => session_result(session.run_grid(body)),
        ("POST", "/api/handoff") => session_result(session.handoff(body)),
        ("POST", "/api/link") => session_result(session.link(body)),
        ("POST", "/api/bundle-draft") => session_result(session.bundle_draft()),
        ("POST", "/api/arc3") => session_result(session.run_arc3(body)),
        ("POST", "/api/perception") => session_result(session.run_perception(body)),
        ("POST", "/api/attention") => session_result(session.run_attention(body)),
        ("POST", "/api/learning") => session_result(session.run_learning(body)),
        ("POST", "/api/memory") => session_result(session.run_memory(body)),
        ("POST", "/api/reasoning") => session_result(session.run_reasoning(body)),
        ("POST", "/api/problem") => session_result(session.run_problem(body)),
        ("POST", "/api/generation") => session_result(session.run_generation(body)),
        ("POST", "/api/executive") => session_result(session.run_executive(body)),
        ("POST", "/api/social") => session_result(session.run_social(body)),
        ("POST", "/api/metacognition") => session_result(session.run_metacognition(body)),
        ("POST", "/api/separation") => session_result(session.separate(body)),
        ("POST", "/api/correction") => session_result(session.correct()),
        ("POST", "/api/receipt") => session_result(session.issue_receipt()),
        ("POST", "/api/bundle") => session_result(session.verify_bundle(body)),
        ("GET", "/api/plan" | "/api/demo") => json_error(405, "use POST"),
        ("POST", "/" | "/index.html" | "/console.css" | "/console.js" | "/api/status") => {
            json_error(405, "use GET")
        }
        _ => json_error(404, "not found"),
    }
}

fn journal_route(path: &str) -> bool {
    matches!(
        path,
        "/api/plan"
            | "/api/demo"
            | "/api/bitflip"
            | "/api/grid"
            | "/api/handoff"
            | "/api/link"
            | "/api/perception"
            | "/api/attention"
            | "/api/learning"
            | "/api/memory"
            | "/api/reasoning"
            | "/api/problem"
            | "/api/generation"
            | "/api/executive"
            | "/api/social"
            | "/api/metacognition"
            | "/api/separation"
            | "/api/correction"
            | "/api/receipt"
            | "/api/bundle"
    )
}

fn load_journal(
    session: &mut crate::cockpit::Session,
    path: &std::path::Path,
) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let entries: Vec<serde_json::Value> =
        serde_json::from_slice(&bytes).map_err(|_| "operator journal is not valid".to_string())?;
    let mut parsed = Vec::with_capacity(entries.len());
    for entry in entries {
        let route = entry["route"]
            .as_str()
            .filter(|route| journal_route(route))
            .ok_or_else(|| "operator journal names an unknown check".to_string())?;
        let body = if entry["body"].is_null() {
            Vec::new()
        } else {
            serde_json::to_vec(&entry["body"]).map_err(|error| error.to_string())?
        };
        parsed.push((route.to_string(), body));
    }
    session.replace_journal(parsed.clone())?;
    for (route, body) in parsed {
        let response = handle("POST", &route, &body, session);
        if response.status != 200 {
            let message = serde_json::from_slice::<serde_json::Value>(&response.body)
                .ok()
                .and_then(|value| value["error"].as_str().map(str::to_string))
                .unwrap_or_else(|| "operator journal entry did not recompute".to_string());
            return Err(message);
        }
    }
    Ok(())
}

fn faculty_route(path: &str) -> bool {
    matches!(
        path,
        "/api/perception"
            | "/api/attention"
            | "/api/learning"
            | "/api/memory"
            | "/api/reasoning"
            | "/api/problem"
            | "/api/generation"
            | "/api/executive"
            | "/api/social"
            | "/api/metacognition"
    )
}

pub fn serve(addr: SocketAddr) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr)?;
    let mut session = crate::cockpit::Session::new();
    let arc3_path = std::path::Path::new("observations/local-seek.json");
    let faculty_path = std::path::Path::new("observations/faculties.json");
    let journal_path = std::path::Path::new("observations/journal.json");
    if let Err(error) = session.load_arc3(arc3_path) {
        eprintln!("local-seek was not loaded: {error}");
    }
    if journal_path.is_file() {
        if let Err(error) = load_journal(&mut session, journal_path) {
            eprintln!("operator journal was not loaded: {error}");
        }
    } else {
        if let Err(error) = session.load_faculties(faculty_path) {
            eprintln!("faculty log was not loaded: {error}");
        }
        session.seed_journal_from_faculties();
    }
    eprintln!("agi operator listening on http://{addr}");
    for connection in listener.incoming() {
        let mut stream = match connection {
            Ok(stream) => stream,
            Err(_) => continue,
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));
        match read_request(&mut stream) {
            Ok((method, path, body)) => {
                let route = path.split('?').next().unwrap_or("").to_string();
                if method == "POST" && journal_route(&route) && session.journal_full() {
                    let response = json_error(400, "the operator journal already has 128 checks");
                    let _ = write_response(&mut stream, &response);
                    continue;
                }
                let response = handle(&method, &route, &body, &mut session);
                if response.status == 200 {
                    if method == "POST" && route == "/api/arc3" {
                        let _ = session.save_arc3(arc3_path);
                    }
                    if method == "POST" && journal_route(&route) {
                        if let Err(error) = session
                            .remember(&route, &body)
                            .and_then(|_| session.save_journal(journal_path))
                        {
                            eprintln!("operator journal was not saved: {error}");
                        }
                    }
                    if method == "POST" && (faculty_route(&route) || route == "/api/handoff") {
                        if let Err(error) = session.save_faculties(faculty_path) {
                            eprintln!("faculty log was not saved: {error}");
                        }
                    }
                }
                let _ = write_response(&mut stream, &response);
            }
            Err(error) => {
                let response = json_error(error.status, &error.message);
                let _ = write_response(&mut stream, &response);
            }
        }
    }
    Ok(())
}

fn recorded(
    session: &mut crate::cockpit::Session,
    kind: &str,
    verdict: &str,
    response: HttpResponse,
) -> HttpResponse {
    if response.status == 200 {
        session.record(kind, verdict, &response.body);
    }
    response
}

fn session_result(result: Result<serde_json::Value, String>) -> HttpResponse {
    match result {
        Ok(value) => json_ok(&value),
        Err(message) => json_error(400, &message),
    }
}

fn goal<T: serde::Serialize>(body: &[u8], run: fn(&str) -> Result<T, String>) -> HttpResponse {
    let parsed: GoalBody = match serde_json::from_slice(body) {
        Ok(value) => value,
        Err(_) => return json_error(400, "body must be JSON with a goal string"),
    };
    match run(&parsed.goal) {
        Ok(value) => json_ok(&value),
        Err(message) => json_error(400, &message),
    }
}

fn html(body: &str) -> HttpResponse {
    text(200, "text/html; charset=utf-8", body)
}

fn text(status: u16, content_type: &'static str, body: &str) -> HttpResponse {
    HttpResponse {
        status,
        content_type,
        body: body.as_bytes().to_vec(),
    }
}

fn json_ok(value: &impl serde::Serialize) -> HttpResponse {
    match serde_json::to_vec(value) {
        Ok(body) => HttpResponse {
            status: 200,
            content_type: "application/json; charset=utf-8",
            body,
        },
        Err(_) => json_error(500, "could not encode the response"),
    }
}

fn json_error(status: u16, message: &str) -> HttpResponse {
    let body = serde_json::json!({ "error": message, "authority": false })
        .to_string()
        .into_bytes();
    HttpResponse {
        status,
        content_type: "application/json; charset=utf-8",
        body,
    }
}

fn read_request(stream: &mut TcpStream) -> Result<(String, String, Vec<u8>), RequestError> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    let header_end = loop {
        if buf.len() > MAX_BODY {
            return Err(RequestError {
                status: 413,
                message: "request headers are too large".into(),
            });
        }
        let read = stream.read(&mut tmp).map_err(|error| RequestError {
            status: 400,
            message: format!("could not read the request: {error}"),
        })?;
        if read == 0 {
            return Err(RequestError {
                status: 400,
                message: "connection closed before the request finished".into(),
            });
        }
        buf.extend_from_slice(&tmp[..read]);
        if let Some(index) = find_header_end(&buf) {
            break index;
        }
    };
    let header = std::str::from_utf8(&buf[..header_end]).map_err(|_| RequestError {
        status: 400,
        message: "request headers must be UTF-8".into(),
    })?;
    let mut lines = header.split("\r\n");
    let request: Vec<&str> = lines.next().unwrap_or("").split_whitespace().collect();
    if request.len() < 2 {
        return Err(RequestError {
            status: 400,
            message: "request line is incomplete".into(),
        });
    }
    let method = request[0].to_string();
    let path = request[1].to_string();
    let mut length = 0usize;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("content-length") {
            length = value.trim().parse().map_err(|_| RequestError {
                status: 400,
                message: "content-length must be an integer".into(),
            })?;
        }
    }
    if length > MAX_BODY {
        return Err(RequestError {
            status: 413,
            message: "request body is too large".into(),
        });
    }
    let mut body = buf[header_end + 4..].to_vec();
    while body.len() < length {
        let read = stream.read(&mut tmp).map_err(|error| RequestError {
            status: 400,
            message: format!("could not read the body: {error}"),
        })?;
        if read == 0 {
            return Err(RequestError {
                status: 400,
                message: "body ended early".into(),
            });
        }
        body.extend_from_slice(&tmp[..read]);
    }
    body.truncate(length);
    Ok((method, path, body))
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|window| window == b"\r\n\r\n")
}

fn write_response(stream: &mut TcpStream, response: &HttpResponse) -> std::io::Result<()> {
    let reason = match response.status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Content Too Large",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {length}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'none'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        status = response.status,
        content_type = response.content_type,
        length = response.body.len(),
    );
    stream.write_all(head.as_bytes())?;
    stream.write_all(&response.body)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_parse_rejects_wildcards() {
        assert!(parse_loopback("127.0.0.1:8791").is_ok());
        assert!(parse_loopback("[::1]:8791").is_ok());
        assert!(parse_loopback("0.0.0.0:8791").is_err());
        assert!(parse_loopback("127.0.0.1:0").is_err());
    }

    #[test]
    fn status_page_and_catalog_are_served() {
        let mut session = crate::cockpit::Session::new();
        let page = handle("GET", "/", &[], &mut session);
        assert_eq!(page.status, 200);
        let body = String::from_utf8(page.body).expect("utf8");
        assert!(body.contains("Build dependency plan"));
        let status = handle("GET", "/api/status", &[], &mut session);
        let json: serde_json::Value = serde_json::from_slice(&status.body).expect("json");
        assert_eq!(json["authority"], false);
        assert_eq!(json["product"], "agi");
    }

    #[test]
    fn plan_and_demo_routes_match_the_kernel() {
        let mut session = crate::cockpit::Session::new();
        let plan = handle(
            "POST",
            "/api/plan",
            br#"{"goal":"Ship the operator"}"#,
            &mut session,
        );
        assert_eq!(plan.status, 200);
        let plan_json: serde_json::Value = serde_json::from_slice(&plan.body).expect("json");
        assert_eq!(plan_json["tasks"]["design"]["status"], "pending");
        let demo = handle(
            "POST",
            "/api/demo",
            br#"{"goal":"Ship the operator"}"#,
            &mut session,
        );
        let demo_json: serde_json::Value = serde_json::from_slice(&demo.body).expect("json");
        assert_eq!(demo_json["deployed"], false);
        assert_eq!(demo_json["deployment"], "inconclusive");
    }

    #[test]
    fn host_commands_are_not_routed() {
        let mut session = crate::cockpit::Session::new();
        let flip = handle("POST", "/api/bitflip", b"", &mut session);
        let flip_json: serde_json::Value = serde_json::from_slice(&flip.body).expect("json");
        assert_eq!(flip.status, 200);
        assert_eq!(flip_json["verdict"], "fail");
        assert_eq!(flip_json["signature_checked"], false);
        assert_eq!(
            handle("POST", "/api/verify-spec", b"{}", &mut session).status,
            404
        );
        assert_eq!(
            handle("POST", "/api/infer", b"{}", &mut session).status,
            404
        );
        assert_eq!(handle("GET", "/api/plan", &[], &mut session).status, 405);
    }

    #[test]
    fn a_saved_grid_is_recomputed_when_the_journal_reloads() {
        let dir = std::env::temp_dir().join(format!("agi-journal-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("journal.json");
        let body = br#"{"program":"transpose","train":[{"input":[[1,2],[3,4]],"output":[[1,3],[2,4]]}],"test_input":[[0,1],[2,3]],"test_output":[[0,2],[1,3]]}"#;
        let mut session = crate::cockpit::Session::new();
        assert_eq!(handle("POST", "/api/grid", body, &mut session).status, 200);
        session.remember("/api/grid", body).unwrap();
        session.save_journal(&path).unwrap();

        let mut restarted = crate::cockpit::Session::new();
        load_journal(&mut restarted, &path).unwrap();
        let view = restarted.view();
        assert_eq!(view["ladder"], "L1");
        assert_eq!(view["assessment"], "pending");
        assert_eq!(view["declares_agi"], false);

        std::fs::write(
            &path,
            r#"[{"route":"/api/grid","body":{"program":"identity","train":[{"input":[[1,2],[3,4]],"output":[[1,3],[2,4]]}],"test_input":[[0,1],[2,3]],"test_output":[[0,2],[1,3]]}}]"#,
        )
        .unwrap();
        let mut failed = crate::cockpit::Session::new();
        load_journal(&mut failed, &path).unwrap();
        assert_eq!(failed.view()["ladder"], serde_json::Value::Null);
        assert_eq!(failed.view()["assessment"], "contested");
        assert_eq!(failed.view()["declares_agi"], false);
        let _ = std::fs::remove_dir_all(dir);
    }
}
