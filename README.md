# ConectaShop Server — Equipe S1

Servidores da equipe S1 para a dinâmica IntegraLab da disciplina de Sistemas Distribuídos. O projeto expõe dois serviços de uma loja fictícia, cada um em um protocolo:

| Serviço             | Protocolo | O que faz                                         | Porta padrão |
|---------------------|-----------|---------------------------------------------------|--------------|
| Catalog & Quote API | REST      | Consulta produtos e calcula cotações com desconto | `8080`       |
| ShippingService     | gRPC      | Calcula preço e prazo de frete                    | `50051`      |

Os dois são escritos em Node.js (Express e `@grpc/grpc-js`) e sobem juntos, no mesmo processo.

## Como rodar

Requer Node.js 20 ou superior (testado com v22) e npm.

```bash
npm install
npm start
```

Ao subir, cada servidor imprime o endereço em que está escutando:

```
Servidor REST (S1) online em http://0.0.0.0:8080 | log: logs/rest.log
Servidor gRPC (S1) online em 0.0.0.0:50051 | log: logs/grpc.log
```

Para subir somente o gRPC, use `npm run start:grpc`.

### Endereços para informar no sorteio

Troque `<IP-da-maquina>` pelo IP da máquina na rede do laboratório:

- `REST_BASE_URL = http://<IP-da-maquina>:8080`
- `GRPC_TARGET = <IP-da-maquina>:50051`

Teste a partir de outra máquina antes do sorteio. Se o servidor roda dentro do WSL2, veja [Acesso pela rede (WSL2)](#acesso-pela-rede-wsl2).

## Configuração

A configuração é feita por variáveis de ambiente. Todas são opcionais.

| Variável        | Padrão          | Descrição                                               |
|-----------------|-----------------|---------------------------------------------------------|
| `HOST`          | `0.0.0.0`       | Interface de rede (`0.0.0.0` aceita conexões de todas)  |
| `REST_PORT`     | `8080`          | Porta do servidor REST                                  |
| `GRPC_PORT`     | `50051`         | Porta do servidor gRPC                                  |
| `SERVER_TEAM`   | `S1`           | Código da equipe, usado nas respostas gRPC e nos logs   |
| `LOG_FILE`      | `logs/rest.log` | Arquivo de log das chamadas REST                        |
| `GRPC_LOG_FILE` | `logs/grpc.log` | Arquivo de log das chamadas gRPC                        |

Exemplo com portas diferentes:

```bash
REST_PORT=9090 GRPC_PORT=50052 npm start
```

## API REST

Base: `/api/v1`

| Método | Caminho                  | Descrição                     |
|--------|--------------------------|-------------------------------|
| GET    | `/api/v1/products/{sku}` | Consulta um produto           |
| POST   | `/api/v1/quotes`         | Calcula a cotação de um pedido |

### Headers obrigatórios

Toda chamada precisa enviar os dois headers abaixo. Sem qualquer um deles, a resposta é `400 MISSING_REQUIRED_HEADER`.

| Header          | Conteúdo                                                              |
|-----------------|-----------------------------------------------------------------------|
| `X-Client-Team` | Código da equipe cliente (ex.: `C01`)                                 |
| `X-Request-ID`  | Identificador da requisição; o servidor o devolve no header da resposta |

### Catálogo

| SKU      | Nome             | Preço unitário (centavos) |
|----------|------------------|---------------------------|
| `KB-100` | Teclado Mecânico | 25990                     |
| `MS-200` | Mouse Sem Fio    | 12990                     |
| `HD-300` | Headset USB      | 19990                     |
| `MN-400` | Monitor 27       | 119990                    |

Todos os valores monetários da API são inteiros em centavos.

### GET `/api/v1/products/{sku}`

```bash
curl -i http://localhost:8080/api/v1/products/KB-100 \
  -H "X-Client-Team: C01" -H "X-Request-ID: req-001"
```

```json
{
  "sku": "KB-100",
  "name": "Teclado Mecânico",
  "unitPriceCents": 25990,
  "available": true
}
```

Se o SKU não existe, a resposta é `404 PRODUCT_NOT_FOUND`.

### POST `/api/v1/quotes`

O corpo é um JSON com a lista `items`, em que cada item tem `sku` e `quantity`.

```bash
curl -i http://localhost:8080/api/v1/quotes -X POST \
  -H "Content-Type: application/json" \
  -H "X-Client-Team: C01" -H "X-Request-ID: req-003" \
  -d '{"items":[{"sku":"KB-100","quantity":2},{"sku":"MS-200","quantity":1}]}'
```

```json
{
  "requestId": "req-003",
  "subtotalCents": 64970,
  "discountPercent": 5,
  "discountCents": 3248,
  "totalCents": 61722
}
```

Regras do pedido:

- de 1 a 5 itens;
- `quantity` inteiro de 1 a 10;
- cada SKU aparece no máximo uma vez e precisa existir no catálogo.

Desconto, aplicado sobre o subtotal:

| Subtotal (centavos) | Desconto |
|---------------------|----------|
| abaixo de 50000     | 0%       |
| de 50000 a 99999    | 5%       |
| 100000 ou mais      | 10%      |

O valor do desconto é arredondado para baixo (no exemplo, 5% de 64970 = 3248,5 → 3248).

### Erros

Todo erro vem em JSON no mesmo formato:

```json
{
  "code": "PRODUCT_NOT_FOUND",
  "message": "Product not found",
  "requestId": "req-002"
}
```

| Status | `code`                      | Quando ocorre                                                                  |
|--------|-----------------------------|--------------------------------------------------------------------------------|
| 400    | `MISSING_REQUIRED_HEADER`   | Falta `X-Client-Team` ou `X-Request-ID`                                        |
| 400    | `INVALID_REQUEST`           | JSON malformado, `items` ausente ou não é lista, item sem `sku` ou `quantity`  |
| 404    | `PRODUCT_NOT_FOUND`         | SKU consultado não existe                                                      |
| 404    | `NOT_FOUND`                 | Rota inexistente                                                               |
| 422    | `INVALID_QUANTITY_OR_ITEMS` | Lista vazia ou com mais de 5 itens, `quantity` fora de 1–10, SKU repetido      |
| 422    | `INVALID_PRODUCT`           | Algum SKU do pedido não existe no catálogo                                     |
| 500    | `INTERNAL_ERROR`            | Erro inesperado no servidor                                                    |

## Serviço gRPC — ShippingService

O contrato está em [grpc/shipping.proto](grpc/shipping.proto) (pacote `shipping.v1`) e é usado sem alterações. A conexão não usa TLS, como previsto para o laboratório.

| RPC                 | Requisição                                 | Resposta                                                   |
|---------------------|--------------------------------------------|------------------------------------------------------------|
| `Health`            | vazia                                      | `status` (`SERVING`), `server_team`                        |
| `CalculateShipping` | `request_id`, `weight_grams`, `zone`, `mode` | `request_id`, `price_cents`, `estimated_days`, `server_team` |

As duas chamadas exigem a metadata `x-client-team` com o código da equipe cliente.

### Cálculo do frete

O preço é a tarifa base da combinação zona/modalidade mais um valor por quilo. O peso é arredondado para cima, para o quilo inteiro seguinte, e deve estar entre 1 e 30000 gramas.

| Zona       | Modalidade | Tarifa base (centavos) | Por kg (centavos) | Prazo (dias) |
|------------|------------|------------------------|-------------------|--------------|
| `LOCAL`    | `STANDARD` | 1000                   | 400               | 2            |
| `LOCAL`    | `EXPRESS`  | 1600                   | 600               | 1            |
| `REGIONAL` | `STANDARD` | 1800                   | 400               | 4            |
| `REGIONAL` | `EXPRESS`  | 2800                   | 600               | 2            |
| `NATIONAL` | `STANDARD` | 3000                   | 400               | 7            |
| `NATIONAL` | `EXPRESS`  | 4500                   | 600               | 3            |

Exemplo: 1500 g, `LOCAL`, `STANDARD` → 2 kg cobrados → 1000 + 2 × 400 = **1800 centavos**, prazo de 2 dias.

### Exemplo com grpcurl

Com o [grpcurl](https://github.com/fullstorydev/grpcurl) instalado:

```bash
grpcurl -plaintext -proto grpc/shipping.proto -H "x-client-team: C01" \
  -d '{"request_id":"req-g2","weight_grams":1500,"zone":"LOCAL","mode":"STANDARD"}' \
  localhost:50051 shipping.v1.ShippingService/CalculateShipping
```

```json
{
  "request_id": "req-g2",
  "price_cents": "1800",
  "estimated_days": 2,
  "server_team": "S1"
}
```

### Erros

Erros de validação retornam o status `INVALID_ARGUMENT`, com um dos códigos abaixo na descrição:

| Código                | Quando ocorre                                        |
|-----------------------|------------------------------------------------------|
| `MISSING_CLIENT_TEAM` | Metadata `x-client-team` ausente ou vazia            |
| `MISSING_REQUEST_ID`  | `request_id` vazio (só em `CalculateShipping`)       |
| `INVALID_WEIGHT`      | `weight_grams` fora de 1–30000                       |
| `INVALID_ZONE`        | `zone` não é `LOCAL`, `REGIONAL` ou `NATIONAL`       |
| `INVALID_MODE`        | `mode` não é `STANDARD` ou `EXPRESS`                 |

Exceções inesperadas retornam o status `INTERNAL` com a descrição `INTERNAL_ERROR`.

## Testes

Os testes fazem chamadas reais, então o servidor precisa estar rodando (`npm start`) em outro terminal.

```bash
npm run test:rest   # casos R1–R5 do contrato + casos de erro (requer curl)
npm run test:grpc   # casos G1–G5 do contrato + casos de erro
```

Por padrão eles apontam para `localhost`. Para testar um servidor em outra máquina:

```bash
BASE_URL=http://10.0.0.23:8080 npm run test:rest
GRPC_TARGET=10.0.0.23:50051 npm run test:grpc
```

O cliente gRPC de teste se identifica como `C01`; para mudar, defina `CLIENT_TEAM`.

## Logs

Toda chamada recebida, com sucesso ou erro, é impressa no console e gravada em arquivo, uma linha por requisição. A pasta `logs/` é criada automaticamente.

REST (`logs/rest.log`):

```
[2026-09-10T18:10:47.614Z] protocol=REST server=S1 client=C01 requestId=r1 operation=GET_PRODUCT input=KB-100 status=200 result=OK
```

gRPC (`logs/grpc.log`):

```
[2026-09-10T18:28:31.639Z] protocol=GRPC server=S1 client=C01 requestId=req-g2 operation=CalculateShipping weight=1500 zone=LOCAL mode=STANDARD status=OK request_id=req-g2 price_cents=1800 estimated_days=2 server_team=S1 result=OK
[2026-09-10T18:28:31.647Z] protocol=GRPC server=S1 client=C01 requestId=req-g5 operation=CalculateShipping weight=0 zone=LOCAL mode=STANDARD status=INVALID_ARGUMENT error=INVALID_WEIGHT result=ERROR
```

Quando o cliente não envia a equipe ou o ID da requisição, o campo aparece como `-`.

## Estrutura do projeto

| Arquivo               | Conteúdo                                                        |
|-----------------------|-----------------------------------------------------------------|
| `index.js`            | Ponto de entrada: rotas REST e inicialização dos dois servidores |
| `middleware.js`       | Log das chamadas REST, validação de headers e corpo, tratamento de erros |
| `catalog.js`          | Catálogo de produtos (em memória)                               |
| `config.js`           | Leitura das variáveis de ambiente                               |
| `logger.js`           | Escrita de log no console e em arquivo                          |
| `grpc/shipping.proto` | Contrato do ShippingService                                     |
| `grpc/server.js`      | Servidor gRPC e regras de frete                                 |
| `grpc/test-client.js` | Testes do gRPC                                                  |
| `test-rest.sh`        | Testes do REST                                                  |

## Decisões de interpretação do contrato

Pontos em que o contrato da dinâmica não era explícito e a equipe precisou escolher:

- **`items` ausente ou que não é uma lista** retorna `400 INVALID_REQUEST`; já uma lista vazia ou com mais de 5 itens retorna `422 INVALID_QUANTITY_OR_ITEMS`.
- **Rota inexistente** retorna `404 NOT_FOUND` em JSON. Isso está fora do contrato e existe só para manter o formato de erro consistente.
- **`x-client-team` também é exigido no `Health`**, porque o contrato lista a metadata como obrigatória para o serviço inteiro. Para relaxar essa regra, ajuste a função `unary` em `grpc/server.js`.
- **Valores de enum fora do `.proto`** (ex.: `zone=7`), assim como os valores `UNSPECIFIED`, são tratados como `INVALID_ZONE` ou `INVALID_MODE`.

## Acesso pela rede (WSL2)

Se os servidores rodam dentro do WSL2, outras máquinas da rede não alcançam as portas por padrão. Há duas formas de resolver:

**Opção 1 — rede espelhada.** Adicione ao arquivo `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Depois reinicie o WSL com `wsl --shutdown`.

**Opção 2 — encaminhamento de portas.** No PowerShell como administrador:

```powershell
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenport=8080  listenaddress=0.0.0.0 connectport=8080  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=50051 listenaddress=0.0.0.0 connectport=50051 connectaddress=$wslIp
netsh advfirewall firewall add rule name="ConectaShop REST" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="ConectaShop gRPC" dir=in action=allow protocol=TCP localport=50051
```

O IP do WSL pode mudar a cada reinicialização; se isso acontecer, repita os comandos `portproxy`.
