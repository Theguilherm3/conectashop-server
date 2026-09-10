export const config = {
  host: process.env.HOST || "0.0.0.0",
  restPort: Number(process.env.REST_PORT) || 8080,
  grpcPort: Number(process.env.GRPC_PORT) || 50051,
  serverTeam: process.env.SERVER_TEAM || "S03",
  logFile: process.env.LOG_FILE || "logs/rest.log",
  grpcLogFile: process.env.GRPC_LOG_FILE || "logs/grpc.log",
};
