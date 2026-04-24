import asyncio
import os
import time
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="LLM Benchmarker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1"
REQUEST_TIMEOUT = 60.0


def get_api_key() -> str:
    key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY is not configured")
    return key


def is_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    return "instruct" in lower or "chat" in lower


@app.get("/api/models")
async def get_models():
    api_key = get_api_key()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{NVIDIA_API_BASE}/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        resp.raise_for_status()
        data = resp.json()

    all_models = data.get("data", [])
    chat_models = [m for m in all_models if is_chat_model(m["id"])]

    # Group by provider (prefix before first "/")
    grouped: dict = {}
    for m in chat_models:
        model_id = m["id"]
        parts = model_id.split("/")
        provider = parts[0] if len(parts) > 1 else "other"
        name = parts[-1] if len(parts) > 1 else model_id
        grouped.setdefault(provider, []).append({"id": model_id, "name": name})

    result = [
        {"provider": p, "models": sorted(models, key=lambda x: x["name"])}
        for p, models in sorted(grouped.items())
    ]
    return {"groups": result, "total": len(chat_models)}


class BenchmarkRequest(BaseModel):
    models: List[str]
    prompt: str
    system_prompt: Optional[str] = None


class ModelResult(BaseModel):
    model_id: str
    content: Optional[str] = None
    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    error: Optional[str] = None


async def call_model(
    client: httpx.AsyncClient,
    api_key: str,
    model_id: str,
    messages: list,
) -> ModelResult:
    start = time.perf_counter()
    try:
        resp = await client.post(
            f"{NVIDIA_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model_id,
                "messages": messages,
                "max_tokens": 1024,
                "temperature": 0.7,
            },
            timeout=REQUEST_TIMEOUT,
        )
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        if resp.status_code == 429:
            return ModelResult(
                model_id=model_id,
                error="Rate limit exceeded — try again in a moment.",
                latency_ms=elapsed_ms,
            )
        if resp.status_code == 401:
            return ModelResult(
                model_id=model_id,
                error="Authentication failed — check your NVIDIA_API_KEY.",
                latency_ms=elapsed_ms,
            )
        if resp.status_code == 404:
            return ModelResult(
                model_id=model_id,
                error="Model not available on your account.",
                latency_ms=elapsed_ms,
            )
        if resp.status_code == 422:
            return ModelResult(
                model_id=model_id,
                error="Model does not support chat completions.",
                latency_ms=elapsed_ms,
            )

        resp.raise_for_status()
        data = resp.json()

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})

        return ModelResult(
            model_id=model_id,
            content=content,
            latency_ms=elapsed_ms,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
        )

    except httpx.TimeoutException:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return ModelResult(
            model_id=model_id,
            error="Request timed out after 60 s.",
            latency_ms=elapsed_ms,
        )
    except httpx.HTTPStatusError as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return ModelResult(
            model_id=model_id,
            error=f"API error {exc.response.status_code}: {exc.response.text[:200]}",
            latency_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        return ModelResult(model_id=model_id, error=str(exc), latency_ms=elapsed_ms)


@app.post("/api/benchmark")
async def benchmark(request: BenchmarkRequest):
    if not request.models:
        raise HTTPException(status_code=400, detail="At least one model required")
    if len(request.models) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 models allowed")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    api_key = get_api_key()

    messages = []
    if request.system_prompt and request.system_prompt.strip():
        messages.append({"role": "system", "content": request.system_prompt.strip()})
    messages.append({"role": "user", "content": request.prompt.strip()})

    async with httpx.AsyncClient() as client:
        tasks = [
            call_model(client, api_key, model_id, messages)
            for model_id in request.models
        ]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    results = []
    for i, result in enumerate(raw_results):
        if isinstance(result, Exception):
            results.append(
                ModelResult(model_id=request.models[i], error=str(result)).model_dump()
            )
        else:
            results.append(result.model_dump())

    return {"results": results}


@app.get("/health")
async def health():
    return {"status": "ok"}
