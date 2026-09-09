import express from "express";

const app = express();

const catalog = {
  "KB-100": {
    sku: "KB-100",
    name: "Teclado Mecânico",
    unitPriceCents: 25990,
    available: true,
  },

  "MS-200": {
    sku: "MS-200",
    name: "Mouse Sem Fio",
    unitPriceCents: 12990,
    available: true,
  },

  "HD-300": {
    sku: "HD-300",
    name: "Headset USB",
    unitPriceCents: 19990,
    available: true,
  },

  "MN-400": {
    sku: "MN-400",
    name: "Monitor 27",
    unitPriceCents: 119990,
    available: true,
  },
};

app.get("/api/v1/products/:sku", (req, res) => {
  const clientTeam = req.get("X-Client-Team");
  const requestId = req.get("X-Request-ID");

  console.log(clientTeam, requestId);

  if (!clientTeam || !requestId) {
    return res.status(400).json({
      code: "MISSING_REQUIRED_HEADER",
      message: "Header obrigatório ausente",
    });
  }

  res.set("X-Requset-ID", requestId);

  const sku = req.params.sku;
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

app.listen(8080, () => {
  console.log("Server Online ouvindo");
});
