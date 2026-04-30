import asyncio
import json
import os
import re
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
    temperature: float = 0.7
    max_tokens: int = 1024


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
    temperature: float = 0.7,
    max_tokens: int = 1024,
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
                "max_tokens": max_tokens,
                "temperature": temperature,
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
        if resp.status_code == 400:
            try:
                detail = resp.json().get("detail", "")
            except Exception:
                detail = ""
            if "DEGRADED" in detail:
                msg = "Model is currently degraded on NVIDIA's infrastructure — try again later."
            else:
                msg = f"Bad request: {detail[:120]}" if detail else "Bad request (400)."
            return ModelResult(model_id=model_id, error=msg, latency_ms=elapsed_ms)

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
            call_model(client, api_key, model_id, messages, request.temperature, request.max_tokens)
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


JUDGE_PROMPT_TEMPLATE = """\
You are an impartial LLM evaluator. You will be given a user prompt and responses from {n} different language models. Score each response on three criteria, each from 1 to 5:

- **accuracy**: Is the answer factually correct and directly addresses the question?
- **clarity**: Is the response well-structured, easy to follow, and free of unnecessary jargon?
- **conciseness**: Does the response avoid padding, repetition, and irrelevant content?

Respond with ONLY valid JSON in this exact schema — no markdown fences, no explanation outside the JSON:

{{
  "evaluations": [
    {{
      "model_id": "<model id string>",
      "accuracy": <1-5>,
      "clarity": <1-5>,
      "conciseness": <1-5>,
      "reasoning": "<one or two sentences>"
    }}
  ]
}}

---
USER PROMPT:
{prompt}

---
RESPONSES TO EVALUATE:
{responses}
"""


def _extract_json(text: str) -> dict:
    """Three-level defensive JSON extraction."""
    # Level 1: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Level 2: strip markdown code fences
    stripped = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    stripped = re.sub(r"\s*```$", "", stripped.strip(), flags=re.MULTILINE)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Level 3: extract outermost {...} block
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON from judge response: {text[:300]}")


class JudgeScores(BaseModel):
    model_id: str
    accuracy: Optional[int] = None
    clarity: Optional[int] = None
    conciseness: Optional[int] = None
    reasoning: Optional[str] = None
    error: Optional[str] = None


class JudgeRequest(BaseModel):
    judge_model: str
    prompt: str
    results: List[dict]  # list of ModelResult dicts (model_id + content)


async def call_judge(
    client: httpx.AsyncClient,
    api_key: str,
    judge_model: str,
    prompt: str,
    results: List[dict],
) -> List[JudgeScores]:
    # Build the responses block — only include successful results
    valid = [r for r in results if r.get("content")]
    if not valid:
        return [
            JudgeScores(model_id=r["model_id"], error="No content to evaluate")
            for r in results
        ]

    responses_block = "\n\n".join(
        f"[Model: {r['model_id']}]\n{r['content']}" for r in valid
    )
    judge_prompt = JUDGE_PROMPT_TEMPLATE.format(
        n=len(valid),
        prompt=prompt,
        responses=responses_block,
    )

    try:
        resp = await client.post(
            f"{NVIDIA_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": judge_model,
                "messages": [{"role": "user", "content": judge_prompt}],
                "max_tokens": 2048,
                "temperature": 0.1,
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        raw_content = data["choices"][0]["message"]["content"]
        parsed = _extract_json(raw_content)
        evaluations = parsed.get("evaluations", [])
    except Exception as exc:
        error_msg = f"Judge call failed: {str(exc)[:200]}"
        return [JudgeScores(model_id=r["model_id"], error=error_msg) for r in results]

    # Map parsed scores back to all models (including failed ones)
    scores_by_model = {e["model_id"]: e for e in evaluations}
    output = []
    for r in results:
        mid = r["model_id"]
        if mid in scores_by_model:
            e = scores_by_model[mid]
            output.append(
                JudgeScores(
                    model_id=mid,
                    accuracy=e.get("accuracy"),
                    clarity=e.get("clarity"),
                    conciseness=e.get("conciseness"),
                    reasoning=e.get("reasoning"),
                )
            )
        elif not r.get("content"):
            output.append(JudgeScores(model_id=mid, error="Model had no output to evaluate"))
        else:
            output.append(JudgeScores(model_id=mid, error="Judge did not return scores for this model"))
    return output


@app.post("/api/judge")
async def judge(request: JudgeRequest):
    if not request.judge_model.strip():
        raise HTTPException(status_code=400, detail="judge_model is required")
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    if not request.results:
        raise HTTPException(status_code=400, detail="results list is required")

    api_key = get_api_key()

    async with httpx.AsyncClient() as client:
        scores = await call_judge(client, api_key, request.judge_model, request.prompt, request.results)

    return {"scores": [s.model_dump() for s in scores]}


async def stream_model(
    api_key: str,
    model_id: str,
    messages: list,
    temperature: float,
    max_tokens: int,
):
    """Async generator that yields SSE-ready dicts for one model."""
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{NVIDIA_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_id,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": True,
                },
            ) as resp:
                if resp.status_code != 200:
                    await resp.aread()
                    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
                    if resp.status_code == 429:
                        error = "Rate limit exceeded — try again in a moment."
                    elif resp.status_code == 401:
                        error = "Authentication failed — check your NVIDIA_API_KEY."
                    elif resp.status_code == 404:
                        error = "Model not available on your account."
                    elif resp.status_code == 422:
                        error = "Model does not support chat completions."
                    elif resp.status_code == 400:
                        try:
                            detail = resp.json().get("detail", "")
                        except Exception:
                            detail = ""
                        error = "Model is currently degraded — try again later." if "DEGRADED" in detail else f"Bad request: {detail[:120]}"
                    else:
                        error = f"API error {resp.status_code}"
                    yield {"model_id": model_id, "done": True, "error": error, "latency_ms": elapsed_ms}
                    return

                usage: dict = {}
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield {"model_id": model_id, "chunk": delta, "done": False}
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

                elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
                yield {
                    "model_id": model_id,
                    "done": True,
                    "latency_ms": elapsed_ms,
                    "usage": usage,
                }

    except httpx.TimeoutException:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        yield {"model_id": model_id, "done": True, "error": "Request timed out after 60 s.", "latency_ms": elapsed_ms}
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
        yield {"model_id": model_id, "done": True, "error": str(exc), "latency_ms": elapsed_ms}


@app.post("/api/benchmark/stream")
async def benchmark_stream(request: BenchmarkRequest):
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

    async def generate():
        queue: asyncio.Queue = asyncio.Queue()
        n = len(request.models)

        async def producer(model_id: str):
            async for event in stream_model(api_key, model_id, messages, request.temperature, request.max_tokens):
                await queue.put(event)
            await queue.put({"__sentinel__": True})

        tasks = [asyncio.create_task(producer(m)) for m in request.models]
        finished = 0
        try:
            while finished < n:
                event = await asyncio.wait_for(queue.get(), timeout=REQUEST_TIMEOUT + 5)
                if event.get("__sentinel__"):
                    finished += 1
                    continue
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.TimeoutError:
            pass
        finally:
            for t in tasks:
                t.cancel()
        yield "data: [DONE]\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
