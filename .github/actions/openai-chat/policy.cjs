"use strict";
const fs = require("node:fs");

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
if (require.main === module) {
  if (process.argv[2] === "payload") {
    const prompt = process.env.PROMPT_PREFIX + fs.readFileSync(process.env.DIFF_PATH, "utf8");
    fs.writeFileSync("body.json", JSON.stringify(payload(process.env, prompt)));
  } else if (process.argv[2] === "metrics") {
    let response = {};
    try { response = JSON.parse(fs.readFileSync("response.json", "utf8")); } catch { /* unavailable evidence remains null */ }
    const data = metrics(response, Number(process.argv[3]), process.env);
    // Only aggregate counters/configuration; never source, prompts or API errors.
    console.log(`OpenAI usage evidence: ${JSON.stringify(data)}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### OpenAI usage evidence\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`);
  }
}
module.exports = { payload, metrics, PRICING, EFFORTS };
