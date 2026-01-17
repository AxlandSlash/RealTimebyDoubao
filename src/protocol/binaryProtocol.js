// 豆包实时语音API 二进制协议编解码器
// 参考: example/python3.7/protocol.py

import pako from 'pako'

// Protocol Version
const PROTOCOL_VERSION = 0b0001
const DEFAULT_HEADER_SIZE = 0b0001

// Message Type
export const CLIENT_FULL_REQUEST = 0b0001
export const CLIENT_AUDIO_ONLY_REQUEST = 0b0010
export const SERVER_FULL_RESPONSE = 0b1001
export const SERVER_ACK = 0b1011
export const SERVER_ERROR_RESPONSE = 0b1111

// Message Type Specific Flags
export const NO_SEQUENCE = 0b0000
export const POS_SEQUENCE = 0b0001
export const NEG_SEQUENCE = 0b0010
export const NEG_SEQUENCE_1 = 0b0011
export const MSG_WITH_EVENT = 0b0100

// Serialization
export const NO_SERIALIZATION = 0b0000
export const JSON_SERIALIZATION = 0b0001

// Compression
export const NO_COMPRESSION = 0b0000
export const GZIP_COMPRESSION = 0b0001

// 事件ID
export const START_CONNECTION = 1
export const FINISH_CONNECTION = 2
export const START_SESSION = 100
export const FINISH_SESSION = 102
export const AUDIO_START = 200
export const CHAT_TTS_TEXT = 300
export const CHAT_TEXT_QUERY = 501
export const CHAT_RAG_TEXT = 502

// 服务器事件
export const CONNECTION_STARTED = 50
export const SESSION_STARTED = 150
export const SESSION_FINISHED = 152
export const TTS_SENTENCE_START = 350
export const TTS_SENTENCE_END = 351
export const TTS_ENDED = 359
export const USER_SPEECH_STARTED = 450
export const ASR_RESULT = 451  // 语音识别结果
export const USER_SPEECH_ENDED = 459

/**
 * 生成协议头部
 */
function generateHeader({
  message_type = CLIENT_FULL_REQUEST,
  message_type_specific_flags = MSG_WITH_EVENT,
  serial_method = JSON_SERIALIZATION,
  compression_type = GZIP_COMPRESSION,
  reserved_data = 0x00,
  extension_header = new Uint8Array()
} = {}) {
  const header = new Uint8Array(4 + extension_header.length)
  const header_size = Math.floor(extension_header.length / 4) + 1

  header[0] = (PROTOCOL_VERSION << 4) | header_size
  header[1] = (message_type << 4) | message_type_specific_flags
  header[2] = (serial_method << 4) | compression_type
  header[3] = reserved_data

  if (extension_header.length > 0) {
    header.set(extension_header, 4)
  }

  return header
}

/**
 * 编码消息
 */
export function encodeMessage({
  messageType = CLIENT_FULL_REQUEST,
  event,
  sessionId,
  payload,
  useGzip = true
}) {
  const buffers = []

  // 1. Header
  const compression = useGzip ? GZIP_COMPRESSION : NO_COMPRESSION
  let flags = MSG_WITH_EVENT
  let serialization = JSON_SERIALIZATION

  // 音频数据使用 NO_SERIALIZATION
  if (messageType === CLIENT_AUDIO_ONLY_REQUEST) {
    serialization = NO_SERIALIZATION
  }

  const header = generateHeader({
    message_type: messageType,
    message_type_specific_flags: flags,
    serial_method: serialization,
    compression_type: compression
  })
  buffers.push(header)

  // 2. Event ID (4 bytes)
  const eventBuf = new DataView(new ArrayBuffer(4))
  eventBuf.setInt32(0, event || 0, false) // big-endian
  buffers.push(new Uint8Array(eventBuf.buffer))

  // 3. Session ID
  if (sessionId) {
    const sessionIdBytes = new TextEncoder().encode(sessionId)
    const sizeBuf = new DataView(new ArrayBuffer(4))
    sizeBuf.setInt32(0, sessionIdBytes.length, false)
    buffers.push(new Uint8Array(sizeBuf.buffer))
    buffers.push(sessionIdBytes)
  }

  // 4. Payload
  let payloadBytes = payload || new Uint8Array()

  // 压缩 payload
  if (useGzip && payloadBytes.length > 0) {
    try {
      payloadBytes = pako.gzip(payloadBytes)
    } catch (e) {
      console.error('Gzip compress error:', e)
    }
  }

  // Payload size
  const sizeBuf = new DataView(new ArrayBuffer(4))
  sizeBuf.setInt32(0, payloadBytes.length, false)
  buffers.push(new Uint8Array(sizeBuf.buffer))

  // Payload data
  if (payloadBytes.length > 0) {
    buffers.push(payloadBytes)
  }

  // 合并所有 buffer
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }

  return result
}

/**
 * 解码消息 (参考 Python 版本 protocol.py)
 */
export function decodeMessage(data) {
  // 1. Header (4 bytes)
  const protocol_version = (data[0] >> 4) & 0x0F
  const header_size = data[0] & 0x0F
  const message_type = (data[1] >> 4) & 0x0F
  const message_type_specific_flags = data[1] & 0x0F
  const serialization_method = (data[2] >> 4) & 0x0F
  const message_compression = data[2] & 0x0F

  const result = {
    protocol_version,
    header_size,
    message_type,
    message_type_specific_flags,
    serialization_method,
    message_compression
  }

  // 跳过 header（包括扩展头）
  let payload = data.slice(header_size * 4)

  // 辅助函数：读取 4 字节大端整数
  const readInt32 = (arr) => {
    return (arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]
  }

  // Sequence (如果有的话)
  if (message_type_specific_flags & 0b0011) {
    result.seq = readInt32(payload.slice(0, 4))
    payload = payload.slice(4)
  }

  // Event
  if (message_type_specific_flags & MSG_WITH_EVENT) {
    result.event = readInt32(payload.slice(0, 4))
    payload = payload.slice(4)
  }

  // Session ID (for SERVER_FULL_RESPONSE or SERVER_ACK)
  if (message_type === SERVER_FULL_RESPONSE || message_type === SERVER_ACK) {
    const session_id_size = readInt32(payload.slice(0, 4))
    result.session_id = new TextDecoder().decode(payload.slice(4, 4 + session_id_size))
    payload = payload.slice(4 + session_id_size)
  }

  // Error code (for SERVER_ERROR_RESPONSE)
  if (message_type === SERVER_ERROR_RESPONSE) {
    result.code = readInt32(payload.slice(0, 4))
    payload = payload.slice(4)
  }

  // Payload size
  const payload_size = readInt32(payload.slice(0, 4))
  result.payload_size = payload_size

  // Payload data
  let payload_msg = payload.slice(4, 4 + payload_size)

  // 解压缩
  if (message_compression === GZIP_COMPRESSION && payload_msg.length > 0) {
    try {
      payload_msg = pako.ungzip(payload_msg)
    } catch (e) {
      console.error('Gzip decompress error:', e)
    }
  }

  // 解析 JSON
  if (serialization_method === JSON_SERIALIZATION && payload_msg.length > 0) {
    try {
      result.payload_msg = JSON.parse(new TextDecoder().decode(payload_msg))
    } catch (e) {
      console.error('JSON parse error:', e)
      result.payload_msg = new TextDecoder().decode(payload_msg)
    }
  } else {
    result.payload_msg = payload_msg
  }

  return result
}

/**
 * 创建 StartConnection 消息
 */
export function createStartConnectionMessage() {
  const payload = new TextEncoder().encode(JSON.stringify({}))
  return encodeMessage({
    messageType: CLIENT_FULL_REQUEST,
    event: START_CONNECTION,
    payload
  })
}

/**
 * 创建 StartSession 消息
 */
export function createStartSessionMessage(sessionId, config) {
  const payload = new TextEncoder().encode(JSON.stringify(config))
  return encodeMessage({
    messageType: CLIENT_FULL_REQUEST,
    event: START_SESSION,
    sessionId,
    payload
  })
}

/**
 * 创建音频消息
 */
export function createAudioMessage(sessionId, audioData) {
  return encodeMessage({
    messageType: CLIENT_AUDIO_ONLY_REQUEST,
    event: AUDIO_START,
    sessionId,
    payload: audioData
  })
}

/**
 * 创建 ChatTextQuery 消息
 */
export function createChatTextQueryMessage(sessionId, text) {
  const payload = new TextEncoder().encode(JSON.stringify({ content: text }))
  return encodeMessage({
    messageType: CLIENT_FULL_REQUEST,
    event: CHAT_TEXT_QUERY,
    sessionId,
    payload
  })
}

/**
 * 创建 FinishSession 消息
 */
export function createFinishSessionMessage(sessionId) {
  const payload = new TextEncoder().encode(JSON.stringify({}))
  return encodeMessage({
    messageType: CLIENT_FULL_REQUEST,
    event: FINISH_SESSION,
    sessionId,
    payload
  })
}

/**
 * 创建 FinishConnection 消息
 */
export function createFinishConnectionMessage() {
  const payload = new TextEncoder().encode(JSON.stringify({}))
  return encodeMessage({
    messageType: CLIENT_FULL_REQUEST,
    event: FINISH_CONNECTION,
    payload
  })
}
