#include "sandbox.h"

#include <drogon/drogon.h>
#include <json/json.h>
#include <string>

using namespace drogon;

int main() {
    // ── POST /api/v1/compile ──────────────────────────────────────────────
    app().registerHandler(
        "/api/v1/compile",
        [](const HttpRequestPtr& req,
           std::function<void(const HttpResponsePtr&)>&& callback) {
            // parse JSON body (Drogon returns Json::Value)
            auto jsonPtr = req->getJsonObject();
            if (!jsonPtr || !jsonPtr->isMember("code") || !(*jsonPtr)["code"].isString()) {
                Json::Value err;
                err["error"] = "missing required field: code (string)";
                auto resp = HttpResponse::newHttpJsonResponse(err);
                resp->setStatusCode(k400BadRequest);
                callback(resp);
                return;
            }

            std::string code   = (*jsonPtr)["code"].asString();
            int timeout        = 10;
            if (jsonPtr->isMember("timeout") && (*jsonPtr)["timeout"].isInt()) {
                int t = (*jsonPtr)["timeout"].asInt();
                if (t > 0 && t <= 60) timeout = t;
            }

            // compile and run
            CompileResult result = compile_and_run(code, timeout);

            Json::Value body;
            body["success"]   = result.success;
            body["stdout"]    = result.stdout_str;
            body["stderr"]    = result.stderr_str;
            body["exit_code"] = result.exit_code;

            auto resp = HttpResponse::newHttpJsonResponse(body);
            resp->setStatusCode(k200OK);
            callback(resp);
        },
        {Post});

    // ── GET /api/v1/health ─────────────────────────────────────────────────
    app().registerHandler(
        "/api/v1/health",
        [](const HttpRequestPtr& req,
           std::function<void(const HttpResponsePtr&)>&& callback) {
            Json::Value body;
            body["status"] = "ok";
            auto resp = HttpResponse::newHttpJsonResponse(body);
            callback(resp);
        },
        {Get});

    // ── Start server ───────────────────────────────────────────────────────
    LOG_INFO << "mathos-kernel starting on port 8100";
    app().addListener("127.0.0.1", 8100);
    app().setLogPath("");
    app().setLogLevel(trantor::Logger::kInfo);
    app().run();

    return 0;
}
