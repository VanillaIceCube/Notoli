// Validate workflows, scripts, Compose models and the application release guide locally.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");

function run(command, args, env = process.env) {
  execFileSync(command, args, { env, stdio: "inherit" });
}

function checkWhitespace() {
  const { GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventFile, CI } = process.env;
  if (["pull_request", "push"].includes(eventName)) {
    if (!eventFile) throw new Error("CI whitespace validation requires the platform event");
    const event = JSON.parse(fs.readFileSync(eventFile, "utf8"));
    const [first, last] = eventName === "pull_request"
      ? [event.pull_request.base.sha, event.pull_request.head.sha]
      : [event.before, event.after];
    for (const sha of [first, last]) {
      if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Invalid platform commit for whitespace validation");
    }
    if (first === "0".repeat(40)) run("git", ["show", "--format=", "--check", last, "--"]);
    else run("git", ["diff", "--check", first, last, "--"]);
  } else if (CI) {
    run("git", ["show", "--format=", "--check", "HEAD", "--"]);
  }
  run("git", ["diff", "--check", "HEAD", "--"]);
}

function checkLocalPolicy(model, development) {
  const { services } = model;
  const ports = Object.values(services).flatMap((service) => service.ports ?? []);
  if (!ports.length || ports.some((port) => port.host_ip !== "127.0.0.1")) {
    throw new Error("Local services must publish only to IPv4 loopback");
  }
  const { backend, frontend, proxy } = services;
  const databases = (backend.volumes ?? []).filter((volume) => volume.target === "/backend/db.sqlite3");
  const createPath = databases[0]?.bind?.create_host_path;
  if (databases.length !== 1 || databases[0].type !== "bind" || (createPath !== undefined && createPath !== false)) {
    throw new Error("Local SQLite must bind an existing file without auto-creating its path");
  }
  const env = backend.environment;
  if (development) {
    if (env.DJANGO_DEBUG !== "1" || env.DJANGO_TRUSTED_PROXY_IPS !== "" || !backend.command?.includes("--no-proxy-headers")) {
      throw new Error("Direct local development must use debug mode and trust no proxy");
    }
    if (frontend.environment.HOST !== "0.0.0.0") throw new Error("The development frontend must listen on its container interface");
    return;
  }
  const targets = new Set(proxy.ports.map((port) => port.target));
  if (backend.ports?.length || frontend.ports?.length || targets.size !== 2 || !targets.has(80) || !targets.has(443)) {
    throw new Error("Standalone HTTPS must publish only its TLS/redirect proxy");
  }
  if (model.networks.backend_private.internal !== true) throw new Error("The backend proxy network must remain internal");
  function hasNetworks(service, expected) {
    return Object.keys(service.networks).length === expected.length && expected.every((name) => Object.hasOwn(service.networks, name));
  }
  if (!hasNetworks(backend, ["backend_egress", "backend_private"]) || Object.hasOwn(frontend.networks, "backend_private")
      || !hasNetworks(proxy, ["backend_private", "default"])) {
    throw new Error("Only the standalone proxy may bridge frontend and backend networks");
  }
  const address = proxy.networks.backend_private.ipv4_address;
  if (!address || env.DJANGO_TRUSTED_PROXY_IPS !== address) throw new Error("Backend trust must match the exact standalone proxy address");
  const origin = proxy.environment.LOCAL_HTTPS_ORIGIN;
  const names = ["DJANGO_FRONTEND_BASE_URL", "DJANGO_MCP_BASE_URL", "DJANGO_CORS_ALLOWED_ORIGINS", "DJANGO_CSRF_TRUSTED_ORIGINS"];
  if (!origin?.startsWith("https://") || names.some((name) => env[name] !== origin)) {
    throw new Error("Standalone browser, OAuth and trusted origins must agree");
  }
}

function checkLocalStaticRoutes() {
  const proxy = fs.readFileSync("deploy/nginx.conf", "utf8");
  for (const prefix of ["/static/admin/", "/static/rest_framework/"]) {
    const location = new RegExp("^\\s*location\\s+\\^~\\s+" + prefix + "\\s*\\{([^{}]*)\\}", "m").exec(proxy);
    if (!location || !/^\s*proxy_pass\s+http:\/\/backend:8000\s*;/m.test(location[1])) {
      throw new Error("Standalone HTTPS must route " + prefix + " to backend:8000");
    }
  }
}

function checkReleaseDocumentation() {
  const { shared_source } = JSON.parse(fs.readFileSync("deploy/production/app.json", "utf8"));
  const guide = fs.readFileSync("deploy/production/README.md", "utf8");
  const source = "https://github.com/" + shared_source.repository + "/blob/" + shared_source.commit;
  if (!guide.includes("(" + source + "/deploy/README.md)")) {
    throw new Error("Link the production guide to the release guide at the commit pinned in app.json");
  }
}

function checkSyntax(temporary) {
  run("actionlint", ["-ignore", 'unknown permission scope "vulnerability-alerts"']);
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  const powershellParser = [
    "$errors=$null",
    "[void][System.Management.Automation.Language.Parser]::ParseFile($env:CHECK_PS_FILE,[ref]$null,[ref]$errors)",
    'if ($errors) { $errors | ForEach-Object { Write-Error ("{0}:{1}: {2}" -f $env:CHECK_PS_FILE,$_.Extent.StartLineNumber,$_.Message) }; exit 1 }',
  ].join("; ");
  const python = [];
  for (const name of tracked.split("\0").filter(Boolean)) {
    if (!fs.statSync(name, { throwIfNoEntry: false })?.isFile()) continue;
    if (name.endsWith(".sh")) run("bash", ["-n", "--", name]);
    else if (name.endsWith(".py") && /^(?:scripts|\.github|deploy)\//.test(name)) python.push(name);
    else if (name.startsWith(".github/") && name.endsWith(".js")) run(process.execPath, ["--check", name]);
    else if (name.endsWith(".ps1")) {
      run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", powershellParser], { ...process.env, CHECK_PS_FILE: path.resolve(name) });
    }
  }
  if (python.length) {
    run(process.platform === "win32" ? "python" : "python3", ["-m", "py_compile", ...python], {
      ...process.env, PYTHONPYCACHEPREFIX: path.join(temporary, "bytecode"),
    });
  }
}

function checkCompose(temporary) {
  const fixture = path.join(temporary, "synthetic.env");
  fs.writeFileSync(fixture, "DJANGO_SECRET_KEY=disposable-fixture-only\n");
  for (const name of ["deploy/compose.yml", "deploy/compose.hotswap.yml", "deploy/production/compose.yml"]) {
    if (!fs.existsSync(name)) continue;
    console.log("Compose configuration: " + name);
    const source = fs.readFileSync(name, "utf8");
    const model = YAML.parse(source, { merge: true });
    // Substitute only private env-file locations and use an isolated interpolation environment.
    for (const service of Object.values(model.services ?? {})) {
      if (Object.hasOwn(service, "env_file")) service.env_file = fixture;
    }
    const rendered = path.join(temporary, path.basename(name));
    fs.writeFileSync(rendered, YAML.stringify(model));
    const retained = new Set(["PATH", "HOME", "SYSTEMROOT", "WINDIR", "PROGRAMFILES", "COMSPEC", "TEMP", "TMP"]);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => retained.has(key.toUpperCase())));
    Object.assign(env, {
      BACKEND_IMAGE: "example/backend@sha256:" + "a".repeat(64),
      FRONTEND_IMAGE: "example/frontend@sha256:" + "b".repeat(64),
      APP_DB_PATH: path.join(temporary, "db.sqlite3"),
    });
    for (const [, variable] of source.matchAll(/\$\{([A-Z][A-Z0-9_]*):?\?/g)) env[variable] ??= path.join(temporary, "fixture");
    const args = ["compose", "--project-directory", path.resolve(path.dirname(name)), "--env-file", fixture, "-f", rendered, "config"];
    run("docker", [...args, "--quiet"], env);
    if (path.dirname(name) === "deploy") {
      const result = execFileSync("docker", [...args, "--format", "json", "--no-env-resolution"], { env, encoding: "utf8" });
      checkLocalPolicy(JSON.parse(result), name === "deploy/compose.hotswap.yml");
    }
  }
}

function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "local-compose-"));
  try {
    checkSyntax(temporary);
    checkCompose(temporary);
    checkLocalStaticRoutes();
    checkReleaseDocumentation();
    checkWhitespace();
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  console.log("Repository files: workflow/composite syntax, script parsers and synthetic Compose validation passed");
}

if (require.main === module) main();
