FROM docker.io/library/rust:1.96-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir pyyaml cryptography numpy scipy scikit-learn pytest jsonschema
COPY verifier /opt/input/verifier
COPY grover /opt/input/grover
COPY eval-pack /opt/input/eval-pack
COPY run_review.py /opt/review/run_review.py
RUN cd /opt/input/verifier/rust && CARGO_HOME=/opt/cargo-cache cargo generate-lockfile && CARGO_HOME=/opt/cargo-cache cargo fetch --locked
ENV PATH="/opt/venv/bin:${PATH}" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 HOME=/work
USER 10001:10001
WORKDIR /work
CMD ["python", "/opt/review/run_review.py"]
