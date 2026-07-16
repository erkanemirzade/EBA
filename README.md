# EBA

CI status: ![CI](https://github.com/erkanemirzade/EBA/actions/workflows/ci.yml/badge.svg)

Local test & lint commands

- Backend (Python/pytest):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pytest -q backend/tests
```

- Frontend (Expo lint):

```bash
cd frontend
yarn install
yarn lint
```

Repository layout: backend and frontend folders contain server and Expo app respectively.
