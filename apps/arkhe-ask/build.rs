fn main() {
    // sqlx::migrate!("./migrations") embeds the directory; added or removed
    // migrations must invalidate the build.
    println!("cargo:rerun-if-changed=migrations");
}
