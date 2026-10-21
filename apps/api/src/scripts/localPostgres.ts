/**
 * Point Neon's serverless driver at a plain Postgres behind Neon's `wsproxy`,
 * the way the UI workflow runs it: no Neon project, no credential, no
 * production rows. Call before the first import of `../db/index.js`.
 *
 * `CHECK_UI_WS_PROXY` is the proxy's `host:port` as this process reaches it. The
 * database host in `DATABASE_URL` is the one the proxy dials (`address=`), so in
 * CI it is the Postgres service's name, not `localhost`.
 */

export async function useLocalPostgresProxy(): Promise<boolean> {
  const proxy = process.env['CHECK_UI_WS_PROXY']
  if (!proxy) return false
  const { neonConfig } = await import('@neondatabase/serverless')
  neonConfig.wsProxy = (host, port) => `${proxy}/v1?address=${host}:${port}`
  neonConfig.useSecureWebSocket = false
  neonConfig.pipelineTLS = false
  neonConfig.pipelineConnect = false
  return true
}
