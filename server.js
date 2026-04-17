const http = require("http");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const { attachSocketServer } = await import("./lib/socket.mjs");

  const server = http.createServer((req, res) => handle(req, res));
  attachSocketServer(server);

  server.listen(port, host, () => {
    console.log(`stokky ready on http://${host}:${port}`);
  });
});
