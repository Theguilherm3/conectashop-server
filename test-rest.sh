#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:8080}"

PASS=0
FAIL=0

run_test() {
  NAME="$1"
  EXPECTED_STATUS="$2"
  EXPECTED_TEXT="$3"
  shift 3

  echo
  echo "=================================================="
  echo "TESTE: $NAME"
  echo "=================================================="

  RESPONSE=$(curl -s -i "$@")

  STATUS=$(echo "$RESPONSE" | head -n 1 | awk '{print $2}')

  echo "$RESPONSE"
  echo

  if [ "$STATUS" != "$EXPECTED_STATUS" ]; then
    echo "❌ FALHOU"
    echo "Esperado HTTP $EXPECTED_STATUS"
    echo "Recebido HTTP $STATUS"

    FAIL=$((FAIL + 1))
    return
  fi

  if [ -n "$EXPECTED_TEXT" ] && ! echo "$RESPONSE" | grep -q "$EXPECTED_TEXT"; then
    echo "❌ FALHOU"
    echo "Não encontrou na resposta:"
    echo "$EXPECTED_TEXT"

    FAIL=$((FAIL + 1))
    return
  fi

  echo "✅ PASSOU"
  PASS=$((PASS + 1))
}


echo
echo "=============================================="
echo "      TESTES REST - CONECTASHOP"
echo "=============================================="
echo "Servidor: $BASE_URL"


# -------------------------------------------------
# R1
# Produto existente
# -------------------------------------------------

run_test \
  "R1 - Consultar KB-100" \
  "200" \
  '"unitPriceCents":25990' \
  "$BASE_URL/api/v1/products/KB-100" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-r1"


# -------------------------------------------------
# R2
# Produto inexistente
# -------------------------------------------------

run_test \
  "R2 - Produto inexistente" \
  "404" \
  '"code":"PRODUCT_NOT_FOUND"' \
  "$BASE_URL/api/v1/products/XX-999" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-r2"


# -------------------------------------------------
# R3
# 2x KB-100 + 1x MS-200
# -------------------------------------------------

run_test \
  "R3 - Cotação com desconto de 5%" \
  "200" \
  '"totalCents":61722' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-r3" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"KB-100","quantity":2},{"sku":"MS-200","quantity":1}]}'


# -------------------------------------------------
# R4
# 1x MN-400
# -------------------------------------------------

run_test \
  "R4 - Cotação com desconto de 10%" \
  "200" \
  '"totalCents":107991' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-r4" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"MN-400","quantity":1}]}'


# -------------------------------------------------
# R5
# SKU inválido na cotação
# -------------------------------------------------

run_test \
  "R5 - SKU inválido na cotação" \
  "422" \
  '"code":"INVALID_PRODUCT"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-r5" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"XX-999","quantity":1}]}'


# -------------------------------------------------
# Header obrigatório ausente
# -------------------------------------------------

run_test \
  "Header obrigatório ausente" \
  "400" \
  '"code":"MISSING_REQUIRED_HEADER"' \
  "$BASE_URL/api/v1/products/KB-100"


# -------------------------------------------------
# Quantidade inválida
# -------------------------------------------------

run_test \
  "Quantidade maior que 10" \
  "422" \
  '"code":"INVALID_QUANTITY_OR_ITEMS"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-invalid-quantity" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"KB-100","quantity":11}]}'


# -------------------------------------------------
# SKU duplicado
# -------------------------------------------------

run_test \
  "SKU duplicado" \
  "422" \
  '"code":"INVALID_QUANTITY_OR_ITEMS"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-duplicate" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"KB-100","quantity":2},{"sku":"KB-100","quantity":1}]}'


# -------------------------------------------------
# Items vazio
# -------------------------------------------------

run_test \
  "Array items vazio" \
  "422" \
  '"code":"INVALID_QUANTITY_OR_ITEMS"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-empty" \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'


# -------------------------------------------------
# Campo quantity ausente
# -------------------------------------------------

run_test \
  "Campo quantity ausente" \
  "400" \
  '"code":"INVALID_REQUEST"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-missing-field" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"KB-100"}]}'


# -------------------------------------------------
# JSON malformado
# -------------------------------------------------

run_test \
  "JSON malformado" \
  "400" \
  '"code":"INVALID_REQUEST"' \
  -X POST "$BASE_URL/api/v1/quotes" \
  -H "X-Client-Team: C01" \
  -H "X-Request-ID: req-bad-json" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"KB-100","quantity":2}'


echo
echo
echo "=============================================="
echo "              RESULTADO FINAL"
echo "=============================================="
echo "✅ Passaram: $PASS"
echo "❌ Falharam: $FAIL"
echo "=============================================="

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 TODOS OS TESTES PASSARAM"
  exit 0
else
  echo "⚠️ EXISTEM TESTES COM FALHA"
  exit 1
fi