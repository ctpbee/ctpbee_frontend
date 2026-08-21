FROM python:3.12-slim

WORKDIR /app

# 依赖先行(利用层缓存)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用
COPY server.py start.py ./
COPY ctpbee-frontend/ ./ctpbee-frontend/

# HTTP 前端(8000) + WS 桥(8765)
EXPOSE 8000 8765

ENV CTPBEE_HTTP_HOST=0.0.0.0 \
    CTPBEE_WS_HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["python", "start.py"]
