"use strict";

const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getAgent, listAgents } = require("./agent_registry");
const { enhanceCommand } = require("./prompt_enhancer");

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("GEMINI_API_KEY is required to execute an AI agent");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

function safeEqual(actual, expected) {
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorizeAgentRequest(req) {
  const configured = process.env.AGENT_ADMIN_TOKEN;
  if (!configured) return { ok: false, status: 503, error: "AGENT_ADMIN_TOKEN is not configured" };

  const authorization = req.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const supplied = req.get("x-agent-token") || bearer;

  if (!safeEqual(supplied, configured)) {
    return { ok: false, status: 401, error: "Unauthorized agent request" };
  }
  return { ok: true };
}

function parseJsonResult(text) {
  const clean = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function runAgent({
  agentId,
  command,
  context,
  mode = "manual",
  execute = true,
  outputContract,
  responseMimeType
}) {
  const agent = getAgent(agentId);
  const enhanced = await enhanceCommand({ agentId, command, context, mode, outputContract });
  const runId = crypto.randomUUID();

  if (!execute) {
    return {
      runId,
      agentId,
      agent: agent.label,
      mode,
      status: "prompt_ready",
      ...enhanced
    };
  }

  const ai = getClient();
  const modelName = process.env.AI_AGENT_MODEL || "gemini-2.5-flash";
  const mimeType = responseMimeType === "application/json" ? "application/json" : "text/plain";
  const model = ai.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: ["mock-test", "job-research", "fact-quality-reviewer"].includes(agentId) ? 0.2 : 0.45,
      maxOutputTokens: Number(process.env.AI_AGENT_MAX_OUTPUT_TOKENS || 8192),
      responseMimeType: mimeType
    }
  });

  const response = await model.generateContent(enhanced.prompt);
  const text = response.response?.text?.().trim();
  if (!text) throw new Error(`${agent.label} returned an empty response`);

  return {
    runId,
    agentId,
    agent: agent.label,
    mode: mode === "auto" ? "auto" : "manual",
    status: "completed",
    promptModel: enhanced.model,
    enhancedByAI: enhanced.enhancedByAI,
    executionModel: modelName,
    output: mimeType === "application/json" ? (parseJsonResult(text) || text) : text
  };
}

function registerAgentRoutes(app) {
  app.get("/agents", (_req, res) => {
    res.json({ success: true, agents: listAgents() });
  });

  app.post("/agents/enhance", async (req, res) => {
    const auth = authorizeAgentRequest(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    try {
      const result = await runAgent({ ...req.body, execute: false });
      return res.json({ success: true, ...result });
    } catch (error) {
      const status = error.code === "UNKNOWN_AGENT" ? 400 : 500;
      return res.status(status).json({ success: false, error: error.message });
    }
  });

  app.post("/agents/run", async (req, res) => {
    const auth = authorizeAgentRequest(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    try {
      const result = await runAgent({ ...req.body, execute: true });
      return res.json({ success: true, ...result });
    } catch (error) {
      const status = ["UNKNOWN_AGENT", "AI_NOT_CONFIGURED"].includes(error.code) ? 400 : 500;
      return res.status(status).json({ success: false, error: error.message });
    }
  });
}

module.exports = {
  authorizeAgentRequest,
  registerAgentRoutes,
  runAgent
};
