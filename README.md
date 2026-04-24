# LLM Benchmarker

An open-source tool for comparing AI model responses side-by-side. Select up to 5 models, enter a prompt, and instantly see responses with latency timings and token counts — all running locally, no accounts required, no data sent anywhere except directly to the NVIDIA NIM API from your own machine.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- A free NVIDIA API key — get one at [build.nvidia.com/models](https://build.nvidia.com/models)

## Setup (3 steps)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/llm-benchmarker.git
cd llm-benchmarker

# 2. Add your NVIDIA API key
cp .env.example .env
# Edit .env and replace "your_nvidia_api_key_here" with your real key

# 3. Start the app
docker-compose up --build
```

Open **http://localhost:3000** in your browser. That's it.

> **First run** takes ~2 minutes to build the Docker images. Subsequent starts are instant.

## Usage

1. **Select models** — Check up to 5 models from the panel (grouped by provider). Your selection is saved automatically.
2. **Write your prompt** — Optionally enable a system prompt via the toggle.
3. **Run Benchmark** — All models are queried simultaneously. Results appear with latency, token counts, and a comparison chart.

## Screenshots

<!-- Add screenshots here -->

## Development (without Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
NVIDIA_API_KEY=your_key uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # proxies /api/* to http://localhost:8000
```

## Feature requests & feedback

Open a discussion at [GitHub Discussions](https://github.com/your-username/llm-benchmarker/discussions).

## Roadmap (post-MVP)

- LLM-as-judge eval scores per response
- Human voting on responses
- Run history (localStorage)
- Shareable comparison URLs
- Batch / dataset eval via CSV upload

## License

MIT
