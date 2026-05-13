# Virtual CISO V1.2

The project is split into:

- `backend/`: Django REST API with authentication, governance, risk, integrations and CISO assistant modules.
- `frontend/`: React 19 + Vite + Tailwind interface.
- `docs/`: chapter/application traceability material.
- `Scripts SQL/`: SQL support scripts used during framework import and cleanup.

## Requirements

- Python virtual environment already present at `backend/.venv`, or Python compatible with the pinned requirements.
- Node.js and npm for the frontend.
- PostgreSQL reachable from the backend.
- Optional local services depending on the feature being tested: Ollama, Wazuh, Nmap/OpenSearch integrations.

## Backend Setup

Create a local environment file:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
Copy-Item .env.example .env
```

Edit `backend/.env` with the real local values for PostgreSQL and Ollama. The `.env` file is ignored by Git.

Run checks and start the API:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
.venv\Scripts\python.exe manage.py check
.venv\Scripts\python.exe manage.py runserver
```

If dependencies need to be recreated:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Frontend Setup

Create a frontend environment file:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\frontend
Copy-Item .env.example .env
```

Run the app:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\frontend
npm.cmd install
npm.cmd run dev
```

By default the frontend expects the backend at `http://localhost:8000` and serves the UI at `http://localhost:5173`.

## Validation

Current baseline checks:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
.venv\Scripts\python.exe manage.py check

cd D:\virtual_ciso\virtual_CISO_V1_2\frontend
npm.cmd run build
```

## Security Notes

Runtime secrets are loaded from `.env` files and should not be committed.

Keep the GitHub repository private and rotate real database/API credentials before using the project outside the local development environment.
