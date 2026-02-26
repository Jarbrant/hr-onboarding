## Prerequisites

Software that must be installed on the machine before running the projects locally:

| Tool | Version | Used by |
|------|---------|---------|
| [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) | 10.0+ | `api`, `gateway`, `bff` |
| [Node.js](https://nodejs.org/) | LTS | `ui/client-app` |
| [Yarn](https://yarnpkg.com/) | 4.12.0 | `ui/client-app` |
| [SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) | 2019+ | `api` (DB: `CateringCare`), `gateway` (DB: `api`) |
| [Redis](https://redis.io/download/) | 7+ | `api`, `bff` |
| [RabbitMQ](https://www.rabbitmq.com/download.html) | 3.13+ | `api` |

### Connection strings (Development)

**api** (`appsettings.Development.json`):
```json
"ConnectionStrings": {
  "DefaultConnection": "Data Source=(local);Initial Catalog=CateringCare;Integrated Security=True;Trust Server Certificate=True",
  "Bus": "amqp://guest:guest@localhost",
  "Redis": "localhost:6379"
}
```

**gateway** (`appsettings.Development.json`):
```json
"ConnectionStrings": {
  "DefaultConnection": "Data Source=(local);Initial Catalog=api;Integrated Security=True;MultipleActiveResultSets=True;TrustServerCertificate=true"
}
```

**bff** — needs Redis:
```json
"ConnectionStrings": {
  "Redis": "localhost:6379"
}
```

## Launch Plan (local development)

Launch projects in the following order:

### 1. `api` — CateringCare.Api
```bash
cd api
dotnet run --project src/CateringCare.Api
```
Runs on: `http://localhost:5000` / `https://localhost:5001`  
Requires: SQL Server (`CateringCare` database), Redis

### 2. `gateway` — ApiGateway
```bash
cd gateway
dotnet run --project src/ApiGateway.csproj
```
Runs on: `http://localhost:80` / `https://localhost:443`  
Requires: SQL Server

### 3. `bff` — Bff
```bash
cd bff
dotnet run --project src/Bff.csproj
```
Runs on: `https://localhost:6001`  
Requires: Redis, Gateway must be running

### 4. `ui/client-app` — Angular
```bash
cd ui/client-app
yarn start
```
Runs on: `https://localhost:4200` (SSL)  
Proxies `/bff`, `/internal`, `/local` → `https://localhost:6001`
