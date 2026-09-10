# ConectaShop Server — Equipe S03

Servidores da dinâmica IntegraLab (Sistemas Distribuídos):

- **Servidor REST** — Catalog & Quote API (`/api/v1`) — implementado em Node.js + Express.
- **Servidor gRPC** — ShippingService (`shipping.v1`) — implementado em Node.js + @grpc/grpc-js.

## Pré-requisitos

- Node.js 20 ou superior (testado com v22)
- npm

## Instalação

```bash
npm install
```

## Configuração

Todas as variáveis são opcionais. Sem elas, valem os padrões abaixo.

| Variável      | Padrão          | Descrição                                    |
|---------------|-----------------|----------------------------------------------|
| `HOST`        | `0.0.0.0`       | Interface de bind (0.0.0.0 = todas as redes) |
| `REST_PORT`   | `8080`          | Porta do servidor REST                       |
| `GRPC_PORT`   | `50051`         | Porta do servidor gRPC                       |
| `SERVER_TEAM` | `S03`           | Código da equipe (`server_team` e logs)      |
| `LOG_FILE`    | `logs/rest.log` | Arquivo de log das chamadas REST             |
| `GRPC_LOG_FILE` | `logs/grpc.log` | Arquivo de log das chamadas gRPC           |

## Iniciar os servidores

Os dois servidores sobem juntos, no mesmo processo:

```bash
npm start
```

Somente o gRPC:

```bash
npm run start:grpc
```

Com portas customizadas:

```bash
REST_PORT=9090 GRPC_PORT=50052 npm start
```

Cada servidor imprime o endereço de bind ao subir. Informe no sorteio:

- `REST_BASE_URL = http://<IP-da-maquina>:8080`
- `GRPC_TARGET = <IP-da-maquina>:50051`

## Testes locais

```bash
npm run test:rest                 # bateria R1–R5 + casos de erro (usa BASE_URL, padrão localhost:8080)
npm run test:grpc                 # bateria G1–G5 + casos de erro (usa GRPC_TARGET, padrão localhost:50051)
GRPC_TARGET=10.0.0.23:50051 npm run test:grpc   # contra outra máquina
```

## Endpoints

| Método | Path                     | Descrição          |
|--------|--------------------------|--------------------|
| GET    | `/api/v1/products/{sku}` | Consulta produto   |
| POST   | `/api/v1/quotes`         | Calcula cotação    |

Headers obrigatórios em todas as chamadas: `X-Client-Team` e `X-Request-ID`.
O `X-Request-ID` é devolvido no header da resposta.

Exemplo:

```bash
curl -i http://localhost:8080/api/v1/products/KB-100 \
  -H "X-Client-Team: C01" -H "X-Request-ID: req-001"

curl -i http://localhost:8080/api/v1/quotes -X POST \
  -H "Content-Type: application/json" \
  -H "X-Client-Team: C01" -H "X-Request-ID: req-003" \
  -d '{"items":[{"sku":"KB-100","quantity":2},{"sku":"MS-200","quantity":1}]}'
```

## gRPC — ShippingService

Contrato: [grpc/shipping.proto](grpc/shipping.proto) (package `shipping.v1`), usado sem alterações.
Transporte inseguro (sem TLS), como previsto para o laboratório.

| RPC                 | Metadata obrigatória | Erros (status `INVALID_ARGUMENT`)                                   |
|---------------------|----------------------|----------------------------------------------------------------------|
| `Health`            | `x-client-team`      | `MISSING_CLIENT_TEAM`                                                |
| `CalculateShipping` | `x-client-team`      | `MISSING_CLIENT_TEAM`, `MISSING_REQUEST_ID`, `INVALID_WEIGHT`, `INVALID_ZONE`, `INVALID_MODE` |

Exceções inesperadas retornam status `INTERNAL` com descrição `INTERNAL_ERROR`.

Exemplo com [grpcurl](https://github.com/fullstorydev/grpcurl):

```bash
grpcurl -plaintext -proto grpc/shipping.proto -H "x-client-team: C01" \
  -d '{"request_id":"req-g2","weight_grams":1500,"zone":"LOCAL","mode":"STANDARD"}' \
  localhost:50051 shipping.v1.ShippingService/CalculateShipping
```

## Logs

Toda chamada recebida é impressa no console e gravada em arquivo, uma linha por requisição.

REST (`logs/rest.log`):

```
[2026-09-10T18:10:47.614Z] protocol=REST server=S03 client=C01 requestId=r1 operation=GET_PRODUCT input=KB-100 status=200 result=OK
```

gRPC (`logs/grpc.log`):

```
[2026-09-10T18:28:31.639Z] protocol=GRPC server=S03 client=C01 requestId=req-g2 operation=CalculateShipping weight=1500 zone=LOCAL mode=STANDARD status=OK request_id=req-g2 price_cents=1800 estimated_days=2 server_team=S03 result=OK
[2026-09-10T18:28:31.647Z] protocol=GRPC server=S03 client=C01 requestId=req-g5 operation=CalculateShipping weight=0 zone=LOCAL mode=STANDARD status=INVALID_ARGUMENT error=INVALID_WEIGHT result=ERROR
```

## Decisões de interpretação do contrato

- `items` ausente ou que não seja uma lista → `400 INVALID_REQUEST`.
- Lista com 0 itens ou mais de 5 → `422 INVALID_QUANTITY_OR_ITEMS`.
- Rota inexistente → `404 NOT_FOUND` em JSON (fora do contrato, apenas para consistência).
- gRPC: `x-client-team` é exigido também no `Health`, pois o contrato lista a metadata como obrigatória para o serviço. Para relaxar, basta ajustar o wrapper `unary` em `grpc/server.js`.
- gRPC: valores de enum fora dos definidos no `.proto` (ex.: `zone=7`) são tratados como `INVALID_ZONE` / `INVALID_MODE`.

## Acesso pela rede (WSL2)

Se os servidores rodarem dentro do WSL2, outras máquinas da rede não alcançam as portas por padrão.
Opções:

1. Ativar `networkingMode=mirrored` em `%USERPROFILE%\.wslconfig` e reiniciar o WSL (`wsl --shutdown`); ou
2. Encaminhar a porta no Windows (PowerShell como administrador):

```powershell
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenport=8080  listenaddress=0.0.0.0 connectport=8080  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=50051 listenaddress=0.0.0.0 connectport=50051 connectaddress=$wslIp
netsh advfirewall firewall add rule name="ConectaShop REST" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="ConectaShop gRPC" dir=in action=allow protocol=TCP localport=50051
```

Teste sempre a partir de outra máquina antes do sorteio.
