# Contributing to PyPI Map

First off, thank you for considering contributing to PyPI Map (pypimap.com)! It's people like you who make open-source software such a fantastic ecosystem to explore.

To keep the project clean, scalable, and easy to maintain, please take a look at the guidelines below before submitting your work.

---

## How Can I Contribute?

### 1. Reporting Bugs
* Check the **Issues** tab to see if the bug has already been reported.
* If it hasn't, open a new issue. Include a clear title, a description of the problem, steps to reproduce it, and any relevant screenshots or terminal errors.

### 2. Suggesting Features
* We love new ideas for visualizing dependency networks!
* Open an issue labeled `enhancement` and describe your idea, how it benefits developers, and how you envision it looking or working.

### 3. Submitting Changes (Pull Requests)
* **Fork** the repository and create your branch from `main` (e.g., `git checkout -b feature/awesome-new-view`).
* Ensure your code adheres to standard styling conventions (e.g., PEP 8 for Python backend code, Prettier for frontend assets).
* Keep your commits focused, descriptive, and clean.
* Write or update tests if applicable.
* Open a Pull Request (PR) with a clear description of what your code solves or introduces.

---

## Development Setup

1. **Clone your fork:**
```bash
   >> git clone https://github.com/naelaqel/pypimap.git
   >> cd pypimap
```
2. **Build and start the environment:**
Using the docker-compose.yml file in the root directory, spin up the complete application stack:
```bash
   >> docker-compose up --build
```
3. **Verify the app is running:**
Open your browser and navigate to the local port (e.g., `http://localhost:3000`).

4. **Stopping the containers:**
```bash
   >> docker compose down
```

## Local Frontend Development (Hot Reload)

The default Docker setup serves a **production build** of the frontend — code changes won't reflect live in that container.

For local development with hot-reload:

1. **Start the supporting services (everything except frontend):**
```bash
   >> docker compose up -d postgres_db backend caddy
   >> docker compose stop frontend
```
2. **Run the frontend locally:**
```bash
   >> cd frontend
   >> npm install
   >> npm run dev -- --host
```
3. Open the local URL Vite prints in the terminal (typically `http://localhost:3000`).

> Note: Caddy routes `frontend:3000` internally, so accessing the site through `pypimap.com`/Caddy won't reflect your local changes while the `frontend` container is stopped. Use the Vite dev URL directly instead.

## Code of Conduct
We are committed to providing a welcoming, safe, and inclusive environment for everyone. Please respect fellow contributors, use constructive language, and focus on collaborative problem