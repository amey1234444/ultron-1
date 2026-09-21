# ULTRON ML service.
#
# Two stages, and the split is about more than image size: the builder installs
# a compiler toolchain that has no business being in a running container, and
# the runtime stage never sees it.
#
# The image installs the *full* profile, because a training host and a serving
# host run the same image here — one runs uvicorn, the other runs a training
# command. A serving-only image can be built with `--build-arg PROFILE=api`,
# which drops roughly 600 MB of TensorFlow.

ARG PYTHON_VERSION=3.11
ARG PROFILE=all

# --- builder ---------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS builder

ARG PROFILE

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml requirements.txt ./
COPY app ./app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

RUN pip install --upgrade pip setuptools wheel \
    && pip install ".[${PROFILE}]"

# --- runtime ---------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    # Defaults to shadow. A container started with no configuration produces
    # predictions nobody is paged by, which is the right way round.
    ML_MODE=shadow \
    ML_LOG_LEVEL=INFO \
    ULTRON_ML_ROOT=/srv/ultron-ml

COPY --from=builder /opt/venv /opt/venv

WORKDIR /srv/ultron-ml

COPY app ./app
COPY configs ./configs
# The knowledge snapshot is generated from the TypeScript layer by
# `npm run export:knowledge` and committed. Copying it in means the image is
# pinned to a knowledge version, and the loader verifies its hashes at startup
# — a half-updated snapshot fails at boot rather than mid-diagnosis.
COPY knowledge ./knowledge
COPY pyproject.toml ./

RUN mkdir -p artifacts/datasets artifacts/registry artifacts/models artifacts/baselines \
    && useradd --create-home --uid 10001 ultron \
    && chown -R ultron:ultron /srv/ultron-ml
USER ultron

EXPOSE 8080

# The health endpoint answers even when every model is unavailable, so this
# checks that the service is up rather than that the ML layer is healthy. The
# payload says which.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"

# One worker by default. The pipeline holds rolling windows and decision filter
# state in memory per machine, so several workers would each see a fraction of
# the telemetry and none would have a full window. Scaling out requires
# ML_REDIS_URL, which moves that state where every worker can reach it.
CMD ["uvicorn", "app.api.app:build", "--factory", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
