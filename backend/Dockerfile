# ---- Builder stage: install dependencies ----
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes --only-binary :all: --prefix=/install -r requirements.txt

# Pre-download the default fastembed model BAAI/bge-small-en-v1.5 to cache it in the image
RUN PYTHONPATH=/install/lib/python3.12/site-packages python -c "from fastembed import TextEmbedding; TextEmbedding()"

# ---- Runtime stage: minimal image without build tools ----
FROM python:3.12-slim AS runner

# Install only the runtime library needed for PostgreSQL (no gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from the builder stage
COPY --from=builder /install /usr/local

# Copy pre-downloaded fastembed model cache from the builder
COPY --from=builder /root/.cache/fastembed /home/appuser/.cache/fastembed

# Create a non-root user for running the application
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /home/appuser/.cache

WORKDIR /app

COPY --chown=appuser:appuser ./app ./app

# Switch to non-root user
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/docs')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
