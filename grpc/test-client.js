// Cliente de teste do ShippingService: executa G1–G5 do contrato mais
// alguns casos de erro. Uso: GRPC_TARGET=host:porta node grpc/test-client.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const PROTO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "shipping.proto",
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition);
const ShippingService = proto.shipping.v1.ShippingService;

const target = process.env.GRPC_TARGET || "localhost:50051";
const clientTeam = process.env.CLIENT_TEAM || "C01";

const client = new ShippingService(target, grpc.credentials.createInsecure());

function metadata(team = clientTeam) {
  const md = new grpc.Metadata();
  if (team) md.set("x-client-team", team);
  return md;
}

function call(method, request, md) {
  return new Promise((resolve) => {
    client[method](request, md, (error, response) => resolve({ error, response }));
  });
}

const tests = [
  {
    name: "G1 - Health",
    run: () => call("Health", {}, metadata()),
    expect: ({ response }) => response?.status === "SERVING" && !!response.server_team,
  },
  {
    name: "G2 - 1500g LOCAL STANDARD",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-g2", weight_grams: 1500, zone: "LOCAL", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ response }) =>
      response?.price_cents === 1800 &&
      response.estimated_days === 2 &&
      response.request_id === "req-g2",
  },
  {
    name: "G3 - 2500g REGIONAL EXPRESS",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-g3", weight_grams: 2500, zone: "REGIONAL", mode: "EXPRESS" },
        metadata(),
      ),
    expect: ({ response }) => response?.price_cents === 4600 && response.estimated_days === 2,
  },
  {
    name: "G4 - 1000g NATIONAL STANDARD",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-g4", weight_grams: 1000, zone: "NATIONAL", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ response }) => response?.price_cents === 3400 && response.estimated_days === 7,
  },
  {
    name: "G5 - weight_grams=0",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-g5", weight_grams: 0, zone: "LOCAL", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "INVALID_WEIGHT",
  },
  {
    name: "Extra - sem x-client-team",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-x1", weight_grams: 1500, zone: "LOCAL", mode: "STANDARD" },
        metadata(null),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "MISSING_CLIENT_TEAM",
  },
  {
    name: "Extra - request_id vazio",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "", weight_grams: 1500, zone: "LOCAL", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "MISSING_REQUEST_ID",
  },
  {
    name: "Extra - zone UNSPECIFIED",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-x3", weight_grams: 1500, zone: "SHIPPING_ZONE_UNSPECIFIED", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "INVALID_ZONE",
  },
  {
    name: "Extra - mode UNSPECIFIED",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-x4", weight_grams: 1500, zone: "LOCAL", mode: 0 },
        metadata(),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "INVALID_MODE",
  },
  {
    name: "Extra - 30001g",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-x5", weight_grams: 30001, zone: "LOCAL", mode: "STANDARD" },
        metadata(),
      ),
    expect: ({ error }) =>
      error?.code === grpc.status.INVALID_ARGUMENT && error.details === "INVALID_WEIGHT",
  },
  {
    name: "Extra - 30000g NATIONAL EXPRESS (limite)",
    run: () =>
      call(
        "CalculateShipping",
        { request_id: "req-x6", weight_grams: 30000, zone: "NATIONAL", mode: "EXPRESS" },
        metadata(),
      ),
    expect: ({ response }) => response?.price_cents === 22500 && response.estimated_days === 3,
  },
];

console.log(`Servidor: ${target} | client team: ${clientTeam}\n`);

let pass = 0;
let fail = 0;

for (const test of tests) {
  const result = await test.run();
  const ok = test.expect(result);

  const detail = result.error
    ? `status=${grpc.status[result.error.code]} details=${result.error.details}`
    : JSON.stringify(result.response);

  console.log(`${ok ? "✅" : "❌"} ${test.name}\n   ${detail}`);

  if (ok) pass++;
  else fail++;
}

console.log(`\nPassaram: ${pass} | Falharam: ${fail}`);
client.close();
process.exit(fail === 0 ? 0 : 1);
