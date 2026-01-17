// WebSocket 代理服务器
// 用于转发前端请求到豆包 API（因为浏览器 WebSocket 不支持自定义请求头）

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

const PORT = 3001
const API_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  // 从 URL 查询参数获取认证信息
  const url = new URL(req.url, `http://${req.headers.host}`)
  const appId = url.searchParams.get('appid')
  const accessKey = url.searchParams.get('accessKey')
  const connectId = url.searchParams.get('connectId')

  console.log(`[Proxy] Client connecting, appId: ${appId}`)

  // 消息队列：在 API 连接就绪前缓存消息
  let messageQueue = []
  let apiReady = false

  // 创建到豆包 API 的 WebSocket 连接
  const headers = {
    'X-Api-App-ID': appId,
    'X-Api-Access-Key': accessKey,
    'X-Api-Resource-Id': 'volc.speech.dialog',
    'X-Api-App-Key': 'PlgvMymc7f3tQnJ6'
  }

  if (connectId) {
    headers['X-Api-Connect-Id'] = connectId
  }

  const apiWs = new WebSocket(API_URL, {
    headers
  })

  apiWs.binaryType = 'arraybuffer'

  // API 连接打开
  apiWs.on('open', () => {
    console.log('[Proxy] Connected to API')
    apiReady = true

    // 发送队列中缓存的消息
    if (messageQueue.length > 0) {
      console.log(`[Proxy] Flushing ${messageQueue.length} queued messages`)
      for (const data of messageQueue) {
        apiWs.send(data)
      }
      messageQueue = []
    }
  })

  // API 返回消息 -> 转发给客户端
  apiWs.on('message', (data) => {
    console.log(`[Proxy] Received from API: ${data.byteLength || data.length} bytes`)
    // 打印前20字节用于调试
    if (data instanceof Buffer || data instanceof Uint8Array) {
      const bytes = Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      console.log(`[Proxy] First 20 bytes: ${bytes}`)
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  // API 关闭
  apiWs.on('close', () => {
    console.log('[Proxy] API connection closed')
    ws.close()
  })

  // API 错误
  apiWs.on('error', (err) => {
    console.error('[Proxy] API error:', err.message)
    ws.close()
  })

  // 客户端发送消息 -> 转发给 API（或缓存）
  ws.on('message', (data) => {
    console.log(`[Proxy] Received from Client: ${data.byteLength || data.length} bytes`)
    // 打印前20字节用于调试
    if (data instanceof Buffer || data instanceof Uint8Array) {
      const bytes = Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      console.log(`[Proxy] Client data first 20 bytes: ${bytes}`)
    }

    if (apiReady && apiWs.readyState === WebSocket.OPEN) {
      apiWs.send(data)
      console.log('[Proxy] Forwarded to API')
    } else {
      // API 还没准备好，缓存消息
      console.log('[Proxy] API not ready, queuing message')
      messageQueue.push(data)
    }
  })

  // 客户端关闭
  ws.on('close', () => {
    console.log('[Proxy] Client disconnected')
    if (apiWs.readyState === WebSocket.OPEN) {
      apiWs.close()
    }
  })

  // 客户端错误
  ws.on('error', (err) => {
    console.error('[Proxy] Client error:', err.message)
  })
})

server.listen(PORT, () => {
  console.log(`\n========================================`)
  console.log(`WebSocket Proxy Server running on port ${PORT}`)
  console.log(`Frontend should connect to: ws://localhost:${PORT}`)
  console.log(`========================================\n`)
})
