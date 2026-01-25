# Local Code Execution Service

A local implementation of the LibreChat code execution API for development and testing.

## Quick Start (Docker - Recommended)

```bash
cd deploy/local-code-executor

# Build and run
docker build -t local-code-executor .
docker run -d --name local-code-executor -p 5050:5050 local-code-executor

# Verify it's running
curl http://localhost:5050/health
```

## Quick Start (Python)

1. **Install dependencies:**
   ```bash
   cd deploy/local-code-executor
   pip install -r requirements.txt
   ```

2. **Start the server:**
   ```bash
   python server.py
   ```

3. **Configure LibreChat** (add to `.env`):
   ```bash
   LIBRECHAT_CODE_API_KEY=local-dev-key
   LIBRECHAT_CODE_BASEURL=http://localhost:5050
   ```

4. **Restart LibreChat** and create an agent with "Execute Code" enabled.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/exec` | POST | Execute code |
| `/upload` | POST | Upload file (multipart) |
| `/download/<session_id>/<file>` | GET | Download file |
| `/files/<session_id>` | GET | List session files |
| `/health` | GET | Health check |

## How It Works

- Code is executed via `subprocess` with a 60-second timeout
- Files are stored in `/tmp/code-sessions/<session_id>/mnt/data/`
- Sessions expire after 23 hours
- Supports Python, JavaScript, and TypeScript

## Testing XLSX Processing

```bash
# Start server
python server.py

# In LibreChat:
# 1. Create agent with "Execute Code" enabled
# 2. Upload an XLSX file
# 3. Ask: "Read this spreadsheet and summarize it"
# 4. Agent will write Python with pandas to process the file
```

## Security Warning

This service runs code **without sandboxing**.

- Only use for local development
- Do not expose to public networks
- For production, use Docker isolation or the hosted service at code.librechat.ai

## Supported Languages

| Language | Command | Extension |
|----------|---------|-----------|
| Python | `python3` | `.py` |
| JavaScript | `node` | `.js` |
| TypeScript | `npx ts-node` | `.ts` |

## Pre-installed Libraries

The following Python libraries are available for code execution:

- `pandas` - Data manipulation
- `openpyxl` - Excel read/write
- `xlsxwriter` - Excel writing
- `numpy` - Numerical computing
- `matplotlib` - Visualization
- `requests` - HTTP requests
