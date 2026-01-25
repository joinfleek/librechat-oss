#!/usr/bin/env python3
"""
Local Code Execution Service for LibreChat
Implements the same API as code.librechat.ai for local development.

WARNING: This runs code without sandboxing. Use only for local development.
"""

import os
import uuid
import shutil
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

# Configuration
SESSIONS_DIR = Path('/tmp/code-sessions')
SESSION_TTL_HOURS = 23
EXECUTION_TIMEOUT = 60  # seconds
PORT = 5050

# Track files that existed before execution (for detecting new files)
_pre_execution_files = {}


def get_session_dir(session_id: str) -> Path:
    """Get the session directory path."""
    return SESSIONS_DIR / session_id


def get_mnt_data(session_id: str) -> Path:
    """Get the /mnt/data equivalent for a session."""
    return get_session_dir(session_id) / 'mnt' / 'data'


def ensure_session(session_id: str) -> Path:
    """Ensure session directory exists and return mnt/data path."""
    mnt_data = get_mnt_data(session_id)
    mnt_data.mkdir(parents=True, exist_ok=True)
    return mnt_data


def get_files_in_dir(directory: Path) -> set:
    """Get all files in a directory."""
    if not directory.exists():
        return set()
    return {f.name for f in directory.iterdir() if f.is_file()}


def detect_new_files(session_id: str, mnt_data: Path) -> list:
    """Detect files created during execution."""
    pre_files = _pre_execution_files.get(session_id, set())
    current_files = get_files_in_dir(mnt_data)
    new_files = current_files - pre_files

    result = []
    for filename in new_files:
        file_id = str(uuid.uuid4())[:8]
        result.append({
            'id': file_id,
            'name': filename,
            'path': str(mnt_data / filename)
        })
    return result


@app.route('/exec', methods=['POST'])
def execute():
    """Execute code in a session."""
    data = request.json

    # Get or create session
    session_id = data.get('session_id') or str(uuid.uuid4())
    mnt_data = ensure_session(session_id)

    # Copy referenced files from other sessions
    for f in data.get('files', []):
        src_session = f.get('session_id', session_id)
        src_path = get_mnt_data(src_session) / f['name']
        if src_path.exists():
            shutil.copy(src_path, mnt_data / f['name'])

    # Record pre-execution files
    _pre_execution_files[session_id] = get_files_in_dir(mnt_data)

    # Determine language and executable
    lang = data.get('lang', 'py')
    code = data.get('code', '')

    if lang == 'py':
        ext = '.py'
        cmd = ['python3']
    elif lang in ('js', 'javascript'):
        ext = '.js'
        cmd = ['node']
    elif lang == 'ts':
        ext = '.ts'
        cmd = ['npx', 'ts-node']
    else:
        ext = '.py'
        cmd = ['python3']

    # Write code to file
    code_file = get_session_dir(session_id) / f'code{ext}'
    code_file.write_text(code)

    # Execute code
    try:
        result = subprocess.run(
            cmd + [str(code_file)],
            cwd=str(mnt_data),
            capture_output=True,
            text=True,
            timeout=EXECUTION_TIMEOUT,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'}
        )
        stdout = result.stdout
        stderr = result.stderr
    except subprocess.TimeoutExpired:
        stdout = ''
        stderr = f'Execution timed out after {EXECUTION_TIMEOUT} seconds'
    except Exception as e:
        stdout = ''
        stderr = str(e)

    # Detect new files
    new_files = detect_new_files(session_id, mnt_data)

    return jsonify({
        'session_id': session_id,
        'stdout': stdout,
        'stderr': stderr,
        'files': new_files
    })


@app.route('/upload', methods=['POST'])
def upload():
    """Upload a file to a new session."""
    session_id = str(uuid.uuid4())
    mnt_data = ensure_session(session_id)

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No filename'}), 400

    file_id = str(uuid.uuid4())[:8]
    filepath = mnt_data / file.filename
    file.save(filepath)

    return jsonify({
        'message': 'success',
        'session_id': session_id,
        'files': [{
            'fileId': file_id,
            'filename': file.filename
        }]
    })


@app.route('/download/<session_id>/<path:file_path>', methods=['GET'])
def download(session_id, file_path):
    """Download a file from a session."""
    filepath = get_mnt_data(session_id) / file_path

    if not filepath.exists():
        return jsonify({'error': 'File not found'}), 404

    return send_file(filepath, as_attachment=True)


@app.route('/files/<session_id>', methods=['GET'])
def list_files(session_id):
    """List files in a session."""
    mnt_data = get_mnt_data(session_id)

    if not mnt_data.exists():
        return jsonify([])

    files = []
    for f in mnt_data.iterdir():
        if f.is_file():
            stat = f.stat()
            files.append({
                'name': f'{session_id}/{f.name}',
                'metadata': {
                    'original-filename': f.name,
                    'created': datetime.fromtimestamp(stat.st_ctime).isoformat()
                },
                'lastModified': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })

    return jsonify(files)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'local-code-executor'})


def cleanup_old_sessions():
    """Background task to clean up expired sessions."""
    while True:
        time.sleep(3600)  # Run every hour
        try:
            if not SESSIONS_DIR.exists():
                continue

            cutoff = datetime.now() - timedelta(hours=SESSION_TTL_HOURS)
            for session_dir in SESSIONS_DIR.iterdir():
                if session_dir.is_dir():
                    stat = session_dir.stat()
                    if datetime.fromtimestamp(stat.st_mtime) < cutoff:
                        shutil.rmtree(session_dir)
                        print(f'Cleaned up expired session: {session_dir.name}')
        except Exception as e:
            print(f'Cleanup error: {e}')


if __name__ == '__main__':
    # Ensure sessions directory exists
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_old_sessions, daemon=True)
    cleanup_thread.start()

    print(f'Starting local code executor on port {PORT}')
    print(f'Sessions stored in: {SESSIONS_DIR}')
    print('WARNING: Code runs without sandboxing. Use for local development only.')

    app.run(host='0.0.0.0', port=PORT, debug=True)
