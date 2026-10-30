# arkhe-ask — job-plan service image.
# Build context must be the workspace root (path dependencies):
#   docker build -f apps/arkhe-ask/Dockerfile -t arkhe-ask:dev .
FROM docker.io/library/rust:1.96.0-slim-bookworm AS build
WORKDIR /arkhe
# The root .dockerignore whitelists the sources cargo needs to resolve the
# workspace, so a plain COPY of the context is enough.
COPY . .
RUN cargo build --release -p arkhe-ask

FROM docker.io/library/debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /arkhe/target/release/arkhe-ask /usr/local/bin/arkhe-ask
ENV ARKHE_LISTEN=0.0.0.0:3000
EXPOSE 3000
USER 65534:65534
CMD ["arkhe-ask"]
