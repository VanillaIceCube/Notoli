"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { randomUUID } = require("node:crypto");

const PRICING = Object.freeze({ verified: "2026-11-06", source: "https://developers.openai.com/api/docs/models/gpt-6-luna", model: "gpt-6-luna", input: 0.10, cached_input: 0.01, output: 0.50, unit: "USD per million tokens", tier: "default" });
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];
function payload(env, prompt) {
  if (env.MODEL !== "gpt-6-luna") throw new Error("Unsupported reviewer model; restore reviewed configuration or validate a new model policy through review.");
  const effort = env.REASONING_EFFORT || "medium";
  if (!EFFORTS.includes(effort)) throw new Error("Unsupported reviewer reasoning effort.");
  const budget = Number(env.MAX_OUTPUT_TOKENS);
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 128000) throw new Error("Invalid reviewer output-token budget (1..128000).");
  if (!["true", "false"].includes(env.ENABLE_WEB_SEARCH)) throw new Error("Invalid web-search configuration.");
  return { model: env.MODEL, instructions: env.SYSTEM_PROMPT, input: prompt, max_output_tokens: budget, reasoning: { effort }, ...(env.ENABLE_WEB_SEARCH === "true" ? { tools: [{ type: "web_search", search_context_size: "medium" }], tool_choice: "required" } : {}) };
}
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
function metrics(response, elapsedMs, env) {
  if (!response || typeof response !== "object" || Array.isArray(response)) response = {};
  const input = count(response.usage?.input_tokens);
  const output = count(response.usage?.output_tokens);
  const cached = count(response.usage?.input_tokens_details?.cached_tokens);
  const reasoning = count(response.usage?.output_tokens_details?.reasoning_tokens);
  const known = input !== null && output !== null && cached !== null && cached <= input && input <= 272000 && response.model === env.MODEL && response.service_tier === PRICING.tier;
  return { model: env.MODEL, reasoning_effort: env.REASONING_EFFORT || "medium", max_output_tokens: Number(env.MAX_OUTPUT_TOKENS), request_latency_ms: count(elapsedMs), input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_tokens: reasoning,
    estimated_known_token_cost_usd: known ? ((input - cached) * PRICING.input + cached * PRICING.cached_input + output * PRICING.output) / 1e6 : null,
    total_billed_cost_usd: null, pricing: PRICING,
    note: "Usage/latency measured when available; token cost is an estimate for known short-context Standard token components only. Cache-write, tool, regional and other charges are excluded. Total billed cost is unknown; unavailable fields are null, never zero. Verify pricing before using this dated estimate for decisions." };
}

function requestResponse(body, env) {
  return new Promise((resolve, reject) => {
    const request = https.request("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "OpenAI-Project": env.OPENAI_PROJECT_ID,
      },
      signal: AbortSignal.timeout(180_000),
    }, response => {
      if (response.statusCode >= 400) {
        const retryAfter = response.headers["retry-after"];
        const retry = /^\d{1,7}$/.test(retryAfter) ? ` (retry after ${retryAfter}s)` : "";
        console.warn(`OpenAI HTTP ${response.statusCode}${retry}`);
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    const connectTimer = setTimeout(() => request.destroy(new Error("Connection timed out")), 15_000);
    request.on("socket", socket => {
      if (socket.connecting) socket.once("secureConnect", () => clearTimeout(connectTimer));
      else clearTimeout(connectTimer);
    });
    request.once("close", () => clearTimeout(connectTimer));
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

function outputText(response) {
  if (Array.isArray(response?.output)) {
    const parts = response.output.filter(item => item?.type === "message" && Array.isArray(item.content))
      .flatMap(item => item.content)
      .filter(item => item?.type === "output_text" && typeof item.text === "string");
    return parts.map(item => item.text).join("\n") || "OpenAI did not return usable output.";
  }
  if (response?.error?.message) {
    const { code, type } = response.error;
    const known = ["insufficient_quota", "rate_limit_exceeded", "context_length_exceeded",
      "invalid_api_key", "model_not_found", "permission_denied", "invalid_request_error",
      "server_error", "billing_hard_limit_reached", "organization_deactivated"];
    const category = known.find(value => value === code || value === type);
    return category ? `OpenAI API error: ${category}.` : "OpenAI API error: provider rejected the request.";
  }
  return "OpenAI did not return a response.";
}

function decodeResponse(raw) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    return { content: "OpenAI API error: the response was not valid JSON." };
  }
  return { response, content: outputText(response) };
}

function writeContent(content, env, unavailable) {
  const delimiter = `OPENAI_CONTENT_${randomUUID()}`;
  fs.appendFileSync(env.GITHUB_OUTPUT, `content<<${delimiter}\n${content}\n${delimiter}\n`);
  if (unavailable) {
    console.warn("::warning title=OpenAI response unavailable::No usable OpenAI response was produced. Check quota or tokens, project access, credentials, and service availability.");
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
      "### OpenAI response unavailable\n\nNo usable OpenAI response was produced. Check API quota or tokens, project access, credentials, and service availability before rerunning.\n");
  }
}

async function readReviewContext(env) {
  const names = ["code-review-context.txt", "build-review-context.txt", "security-review-context.txt", "security-alerts.json"];
  const contextPath = names.map(name => path.join(env.RUNNER_TEMP, name)).find(file => file === env.DIFF_PATH);
  if (!contextPath) throw new Error("Unexpected reviewer context path");

  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  const file = await fs.promises.open(contextPath, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Expected a regular, single-link reviewer context file");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

async function run(env, send = requestResponse) {
  const missing = ["OPENAI_API_KEY", "OPENAI_PROJECT_ID"].filter(key => !env[key]);
  if (missing.length) {
    writeContent(`Missing secret(s): ${missing.join(" ")}.`, env, true);
    return;
  }
  const prompt = env.PROMPT_PREFIX + await readReviewContext(env);
  const body = payload(env, prompt);
  const start = Date.now();
  let result;
  try {
    result = decodeResponse(await send(body, env));
  } catch {
    result = { content: "OpenAI request failed before a response was received." };
  }
  const { response, content } = result;
  const usage = metrics(response, Date.now() - start, env);
  console.log(`OpenAI usage evidence: ${JSON.stringify(usage)}`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    `\n### OpenAI usage evidence\n\n\`\`\`json\n${JSON.stringify(usage, null, 2)}\n\`\`\`\n`);
  writeContent(content, env, content.startsWith("OpenAI "));
}

if (require.main === module) run(process.env).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { run, payload, metrics, PRICING, EFFORTS };
