import express from "express";

import {
  logger,
  validateHeaders,
  validateBody,
  notFoundHandler,
  errorHandler,
} from "./middleware.js";

import { catalog } from "./catalog.js";
import { config } from "./config.js";
import { startGrpcServer } from "./grpc/server.js";

const app = express();

app.use(logger);

app.use("/api/v1", validateHeaders);

app.use(express.json());

app.get("/api/v1/products/:sku", (req, res) => {
  const sku = req.params.sku;
  const requestId = req.get("X-Request-ID");

  const product = catalog[sku];

  if (!product) {
    return res.status(404).json({
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found",
      requestId,
    });
  }

  return res.status(200).json(product);
});

app.post("/api/v1/quotes", validateBody, (req, res) => {
  const items = req.body.items;
  const requestId = req.get("X-Request-ID");

  let subtotalCents = 0;

  items.forEach((item) => {
    const product = catalog[item.sku];

    subtotalCents += product.unitPriceCents * item.quantity;
  });

  let discountPercent = 0;

  if (subtotalCents >= 100000) {
    discountPercent = 10;
  } else if (subtotalCents >= 50000) {
    discountPercent = 5;
  }

  const discountCents = Math.floor((subtotalCents * discountPercent) / 100);

  const totalCents = subtotalCents - discountCents;

  return res.status(200).json({
    requestId,
    subtotalCents,
    discountPercent,
    discountCents,
    totalCents,
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.restPort, config.host, () => {
  console.log(
    `Servidor REST (${config.serverTeam}) online em http://${config.host}:${config.restPort} | log: ${config.logFile}`,
  );
});

startGrpcServer();
