import { catalog } from "./catalog.js";
import { config } from "./config.js";
import { writeLog, timestamp } from "./logger.js";

export function logger(req, res, next) {
  res.on("finish", () => {
    const clientTeam = req.get("X-Client-Team") || "-";
    const requestId = req.get("X-Request-ID") || "-";

    // req.path perde o prefixo quando a resposta termina dentro de um
    // middleware montado com app.use("/api/v1", ...); originalUrl não.
    const urlPath = req.originalUrl.split("?")[0];

    let operation = "UNKNOWN";
    let input = `${req.method} ${urlPath}`;

    if (req.method === "GET" && urlPath.startsWith("/api/v1/products/")) {
      operation = "GET_PRODUCT";

      input = urlPath.split("/").pop();
    }

    if (req.method === "POST" && urlPath === "/api/v1/quotes") {
      operation = "CALCULATE_QUOTE";

      input = req.body?.items ? JSON.stringify(req.body.items) : "-";
    }

    const result =
      res.statusCode >= 200 && res.statusCode < 300 ? "OK" : "ERROR";

    writeLog(
      config.logFile,
      `[${timestamp()}] ` +
        `protocol=REST ` +
        `server=${config.serverTeam} ` +
        `client=${clientTeam} ` +
        `requestId=${requestId} ` +
        `operation=${operation} ` +
        `input=${input} ` +
        `status=${res.statusCode} ` +
        `result=${result}`,
    );
  });

  next();
}

export function validateHeaders(req, res, next) {
  const clientTeam = req.get("X-Client-Team");
  const requestId = req.get("X-Request-ID");

  if (requestId) {
    res.set("X-Request-ID", requestId);
  }

  if (!clientTeam || !requestId) {
    return res.status(400).json({
      code: "MISSING_REQUIRED_HEADER",
      message: "Header obrigatório ausente",
      ...(requestId && { requestId }),
    });
  }

  next();
}

export function validateBody(req, res, next) {
  const items = req.body?.items;
  const requestId = req.get("X-Request-ID");

  if (!Array.isArray(items)) {
    return res.status(400).json({
      code: "INVALID_REQUEST",
      message: "Campo obrigatório 'items' ausente ou inválido",
      requestId,
    });
  }

  if (items.length < 1 || items.length > 5) {
    return res.status(422).json({
      code: "INVALID_QUANTITY_OR_ITEMS",
      message: "items deve conter entre 1 e 5 itens",
      requestId,
    });
  }

  const hasMissingFields = items.some((item) => {
    return (
      item === null ||
      typeof item !== "object" ||
      item.sku === undefined ||
      item.quantity === undefined
    );
  });

  if (hasMissingFields) {
    return res.status(400).json({
      code: "INVALID_REQUEST",
      message: "Campo obrigatório ausente ou item inválido",
      requestId,
    });
  }

  const quantitiesAreValid = items.every(
    (item) =>
      Number.isInteger(item.quantity) &&
      item.quantity >= 1 &&
      item.quantity <= 10,
  );

  if (!quantitiesAreValid) {
    return res.status(422).json({
      code: "INVALID_QUANTITY_OR_ITEMS",
      message: "Quantidade inválida",
      requestId,
    });
  }

  const hasInvalidProduct = items.some((item) => {
    return !catalog[item.sku];
  });

  if (hasInvalidProduct) {
    return res.status(422).json({
      code: "INVALID_PRODUCT",
      message: "Produto inválido",
      requestId,
    });
  }

  const hasDuplicatedProduct =
    items.length !== new Set(items.map((item) => item.sku)).size;

  if (hasDuplicatedProduct) {
    return res.status(422).json({
      code: "INVALID_QUANTITY_OR_ITEMS",
      message: "SKU duplicado",
      requestId,
    });
  }

  next();
}

export function notFoundHandler(req, res) {
  const requestId = req.get("X-Request-ID");

  if (requestId) {
    res.set("X-Request-ID", requestId);
  }

  return res.status(404).json({
    code: "NOT_FOUND",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    ...(requestId && { requestId }),
  });
}

export function errorHandler(err, req, res, next) {
  const requestId = req.get("X-Request-ID");

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof SyntaxError && err.status === 400) {
    if (requestId) {
      res.set("X-Request-ID", requestId);
    }

    return res.status(400).json({
      code: "INVALID_REQUEST",
      message: "JSON inválido",
      ...(requestId && { requestId }),
    });
  }

  if (requestId) {
    res.set("X-Request-ID", requestId);
  }

  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Erro interno do servidor",
    ...(requestId && { requestId }),
  });
}
