FROM docker.io/library/rust:1.96-bookworm AS build
WORKDIR /src
ENV CARGO_BUILD_JOBS=2
COPY . /src
RUN cargo build --release --locked -p arkhe-runtime
FROM docker.io/library/debian:bookworm-slim
COPY --from=build /src/target/release/arkhe-runtime /usr/local/bin/arkhe-runtime
USER 10001:10001
ENV ARKHE_LISTEN=0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/arkhe-runtime"]
