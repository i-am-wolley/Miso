const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAppCheck } = require("firebase-admin/app-check");

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.1-flash-lite";
// Keep in sync with GEMINI_MODEL — update together on any future model switch.
const PRICE_PER_INPUT_TOKEN_USD = 0.25 / 1e6;
const PRICE_PER_OUTPUT_TOKEN_USD = 1.50 / 1e6;
const DAILY_QUOTA_PER_HOUSEHOLD = 50;
// Phase 7: reverted to log-only 2026-08-02 — function logs showed every single
// request, before and after the earlier flip, logging "missing App Check token".
// The client was never actually sending one; the App Check console reading that
// looked like "verified traffic" was a misread. Re-flip only after confirming a
// real token round-trips (see _getAppCheckToken in index.html).
const ENFORCE_APP_CHECK = false;

function repairAndParse(str) {
  if (!str) return null;
  str = str.trim();
  str = str.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(str); } catch (_) {}
  var start = str.indexOf("{");
  var end = str.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  str = str.slice(start, end + 1);
  try { return JSON.parse(str); } catch (_) {}
  str = str.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(str); } catch (_) {}
  return null;
}

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
}

async function verifyAppCheck(req) {
  var token = req.get("X-Firebase-AppCheck");
  if (!token) {
    if (ENFORCE_APP_CHECK) throw { status: 401, message: "Missing App Check token" };
    logger.warn("[generateAiContent] missing App Check token (monitor mode, not rejecting)");
    return;
  }
  try {
    await getAppCheck().verifyToken(token);
  } catch (e) {
    if (ENFORCE_APP_CHECK) throw { status: 401, message: "Invalid App Check token" };
    logger.warn("[generateAiContent] App Check verification failed (monitor mode, not rejecting)", e.message);
  }
}

async function verifyAuth(req) {
  var header = req.get("Authorization") || "";
  var match = header.match(/^Bearer (.+)$/);
  if (!match) throw { status: 401, message: "Missing Authorization header" };
  try {
    var decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    throw { status: 401, message: "Invalid ID token" };
  }
}

async function verifyHouseholdMember(householdCode, uid) {
  if (!householdCode) throw { status: 400, message: "Missing householdCode" };
  var hhDoc = await db.collection("households").doc(householdCode).get();
  if (!hhDoc.exists) throw { status: 403, message: "Household not found" };
  var members = hhDoc.data().members || [];
  if (members.indexOf(uid) === -1) throw { status: 403, message: "Not a member of this household" };
}

async function checkAndIncrementQuota(householdCode) {
  var today = new Date().toISOString().slice(0, 10);
  var ref = db.collection("households").doc(householdCode).collection("aiQuota").doc(today);
  await db.runTransaction(async function (tx) {
    var snap = await tx.get(ref);
    var count = snap.exists ? (snap.data().count || 0) : 0;
    if (count >= DAILY_QUOTA_PER_HOUSEHOLD) {
      throw { status: 429, message: "Daily AI request limit reached for this household" };
    }
    tx.set(ref, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

// Admin-only usage/cost tracking on the same per-day doc the quota transaction above writes to.
// aiQuota/{day} is structurally unreadable by any client (see firestore.rules), so no rules
// change is needed to keep this admin-eyes-only. Best-effort — a failure here must not fail
// the underlying AI request the household is waiting on.
async function recordUsage(householdCode, inputTokens, outputTokens) {
  try {
    var costUsd = inputTokens * PRICE_PER_INPUT_TOKEN_USD + outputTokens * PRICE_PER_OUTPUT_TOKEN_USD;
    var today = new Date().toISOString().slice(0, 10);
    var ref = db.collection("households").doc(householdCode).collection("aiQuota").doc(today);
    await ref.set({
      inputTokens: FieldValue.increment(inputTokens),
      outputTokens: FieldValue.increment(outputTokens),
      costUsd: FieldValue.increment(costUsd),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    logger.warn("[generateAiContent] recordUsage failed (non-fatal)", e.message);
  }
}

async function callGemini(apiKey, { system, prompt, maxTokens, images }) {
  var parts = [];
  var fullText = system ? system + "\n\n" + prompt : prompt;
  parts.push({ text: fullText });
  (images || []).forEach(function (p) {
    parts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
  });
  var body = {
    contents: [{ parts: parts }],
    generationConfig: { maxOutputTokens: maxTokens || 2000 }
  };
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey;
  var res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var errBody = await res.json().catch(function () { return {}; });
    throw { status: res.status === 429 ? 429 : 502, message: "Gemini " + res.status + ": " + ((errBody.error && errBody.error.message) || res.statusText) };
  }
  var data = await res.json();
  var text = ((data.candidates || [])[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
    .map(function (p) { return p.text || ""; }).join("").trim();
  var usage = data.usageMetadata || {};
  return {
    text: text,
    json: repairAndParse(text),
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0
  };
}

exports.generateAiContent = onRequest(
  { secrets: [GEMINI_API_KEY], cors: false, region: "us-central1" },
  async function (req, res) {
    setCors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    try {
      await verifyAppCheck(req);
      var uid = await verifyAuth(req);
      var body = req.body || {};
      var householdCode = body.householdCode;
      await verifyHouseholdMember(householdCode, uid);
      await checkAndIncrementQuota(householdCode);

      var result = await callGemini(GEMINI_API_KEY.value(), {
        system: body.system,
        prompt: body.prompt,
        maxTokens: body.maxTokens,
        images: body.images
      });
      await recordUsage(householdCode, result.inputTokens, result.outputTokens);
      res.status(200).json({ text: result.text, json: result.json });
    } catch (e) {
      var status = e.status || 500;
      var message = e.message || "Internal error";
      if (status >= 500) logger.error("[generateAiContent] error", e);
      res.status(status).json({ error: message });
    }
  }
);
