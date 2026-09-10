import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

import { config } from "../config.js";
import { writeLog, timestamp } from "../logger.js";

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
const shippingPackage = proto.shipping.v1;

// ---------------------------------------------------------------------------
// Tabelas do contrato
// ---------------------------------------------------------------------------

const BASE_FARE = {
  LOCAL: { STANDARD: 1000, EXPRESS: 1600 },
  REGIONAL: { STANDARD: 1800, EXPRESS: 2800 },
  NATIONAL: { STANDARD: 3000, EXPRESS: 4500 },
};

const PER_KG = { STANDARD: 400, EXPRESS: 600 };

const ESTIMATED_DAYS = {
  LOCAL: { STANDARD: 2, EXPRESS: 1 },
  REGIONAL: { STANDARD: 4, EXPRESS: 2 },
  NATIONAL: { STANDARD: 7, EXPRESS: 3 },
};

const MAX_WEIGHT_GRAMS = 30000;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function getClientTeam(call) {
  const values = call.metadata.get("x-client-team");
  const value = values.length > 0 ? String(values[0]).trim() : "";
  return value || null;
}

function invalidArgument(details) {
  return { code: grpc.status.INVALID_ARGUMENT, details };
}

function log(fields) {
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

  writeLog(config.grpcLogFile, `[${timestamp()}] ${line}`);
}

// Envolve um handler unário com: validação de x-client-team, log e
// conversão de exceções inesperadas em INTERNAL / INTERNAL_ERROR.
function unary(operation, handler) {
  return (call, callback) => {
    const clientTeam = getClientTeam(call);
    const base = {
      protocol: "GRPC",
      server: config.serverTeam,
      client: clientTeam || "-",
      requestId: call.request?.request_id || "-",
      operation,
    };

    const finish = (error, response, extra = {}) => {
      if (error) {
        log({
          ...base,
          ...extra,
          status: grpc.status[error.code],
          error: error.details,
          result: "ERROR",
        });
      } else {
        // HealthResponse tem um campo "status"; renomeia para não colidir
        // com o status da chamada no log.
        const { status: responseStatus, ...rest } = response;
        log({
          ...base,
          ...extra,
          status: "OK",
          ...(responseStatus !== undefined && { responseStatus }),
          ...rest,
          result: "OK",
        });
      }

      callback(error, response);
    };

    if (!clientTeam) {
      return finish(invalidArgument("MISSING_CLIENT_TEAM"));
    }

    try {
      handler(call.request, finish);
    } catch (err) {
      console.error(`Erro inesperado em ${operation}:`, err);
      finish({ code: grpc.status.INTERNAL, details: "INTERNAL_ERROR" });
    }
  };
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

function health(_request, finish) {
  finish(null, { status: "SERVING", server_team: config.serverTeam });
}

function calculateShipping(request, finish) {
  const { request_id, weight_grams, zone, mode } = request;
  const input = { weight: weight_grams, zone, mode };

  if (!request_id || request_id.trim() === "") {
    return finish(invalidArgument("MISSING_REQUEST_ID"), null, input);
  }

  if (
    !Number.isInteger(weight_grams) ||
    weight_grams < 1 ||
    weight_grams > MAX_WEIGHT_GRAMS
  ) {
    return finish(invalidArgument("INVALID_WEIGHT"), null, input);
  }

  if (!BASE_FARE[zone]) {
    return finish(invalidArgument("INVALID_ZONE"), null, input);
  }

  if (!PER_KG[mode]) {
    return finish(invalidArgument("INVALID_MODE"), null, input);
  }

  const chargedKg = Math.ceil(weight_grams / 1000);
  const priceCents = BASE_FARE[zone][mode] + chargedKg * PER_KG[mode];

  finish(
    null,
    {
      request_id,
      price_cents: priceCents,
      estimated_days: ESTIMATED_DAYS[zone][mode],
      server_team: config.serverTeam,
    },
    input,
  );
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export function startGrpcServer() {
  const server = new grpc.Server();

  server.addService(shippingPackage.ShippingService.service, {
    Health: unary("Health", health),
    CalculateShipping: unary("CalculateShipping", calculateShipping),
  });

  const address = `${config.host}:${config.grpcPort}`;

  server.bindAsync(
    address,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error("Erro ao iniciar servidor gRPC:", error.message);
        process.exitCode = 1;
        return;
      }

      console.log(
        `Servidor gRPC (${config.serverTeam}) online em ${config.host}:${port} | log: ${config.grpcLogFile}`,
      );
    },
  );

  return server;
}

// Permite iniciar somente o gRPC: `node grpc/server.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startGrpcServer();
}
