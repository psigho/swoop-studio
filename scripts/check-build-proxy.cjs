"use strict";

// Exercise the exact @electron/get proxy API used by electron-builder after the
// scoped global-agent override. All traffic stays on loopback.
const assert = require("node:assert/strict");
const http = require("node:http");
const { createRequire } = require("node:module");

const builderRequire = createRequire(require.resolve("app-builder-lib"));
const electronGet = builderRequire("@electron/get");
const requests = [];
const proxy = http.createServer((request, response) => {
  requests.push(request.url);
  response.end("swoop-build-proxy-ok");
});
proxy.listen(0, "127.0.0.1", async () => {
  try {
    const address = proxy.address();
    process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${address.port}`;
    process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.GLOBAL_AGENT_HTTP_PROXY;
    process.env.GLOBAL_AGENT_NO_PROXY = "";
    electronGet.initializeProxy();
    assert.ok(global.GLOBAL_AGENT, "builder downloader initializes proxy");
    const body = await new Promise((resolve, reject) => {
      http
        .get("http://swoop.invalid/packaging-probe", (response) => {
          let result = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (result += chunk));
          response.on("end", () => resolve(result));
        })
        .on("error", reject);
    });
    assert.equal(body, "swoop-build-proxy-ok");
    assert.deepEqual(requests, ["http://swoop.invalid/packaging-probe"]);
    console.log("electron-builder downloader proxy smoke test passed.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    proxy.close();
  }
});
