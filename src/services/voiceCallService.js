// 实时语音通话服务
import { AudioCapture } from '../audio/audioCapture.js'
import { AudioPlayer } from '../audio/audioPlayer.js'
import {
  encodeMessage,
  decodeMessage,
  createStartConnectionMessage,
  createStartSessionMessage,
  createAudioMessage,
  createFinishSessionMessage,
  createFinishConnectionMessage,
  createChatTextQueryMessage,
  START_CONNECTION,
  START_SESSION,
  FINISH_SESSION,
  FINISH_CONNECTION,
  AUDIO_START,
  CHAT_TEXT_QUERY,
  CONNECTION_STARTED,
  SESSION_STARTED,
  SESSION_FINISHED,
  TTS_AUDIO,
  CLEAR_AUDIO,
  TTS_ENDED,
  USER_QUERY_END,
  SERVER_FULL_RESPONSE,
  SERVER_ACK,
  SERVER_ERROR_RESPONSE
} from '../protocol/binaryProtocol.js'

// 连接状态
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  SESSION_STARTED: 'session_started',
  ERROR: 'error'
}

/**
 * 实时语音通话服务
 */
export class VoiceCallService {
  constructor(config) {
    this.config = {
      // WebSocket配置 - 使用本地代理
      url: 'ws://localhost:3001',
      appId: config.appId,
      accessKey: config.accessKey,

      // 会话配置
      speaker: config.speaker || 'zh_male_yunzhou_jupiter_bigtts',
      botName: config.botName || '豆包',
      systemRole: config.systemRole,
      speakingStyle: config.speakingStyle,
      dialogId: config.dialogId || '',

      // 回调函数
      onStateChange: config.onStateChange || (() => { }),
      onTranscript: config.onTranscript || (() => { }),
      onResponse: config.onResponse || (() => { }),
      onError: config.onError || (() => { })
    }

    // 内部状态
    this.state = ConnectionState.DISCONNECTED
    this.ws = null
    this.sessionId = this._generateUUID()
    this.dialogId = ''

    // 音频处理
    this.audioCapture = new AudioCapture()
    this.audioPlayer = new AudioPlayer()

    // 播放队列
    this.audioQueue = []
    this.isPlayingQueue = false
    this.isClearingAudio = false
  }

  /**
   * 连接到服务器（通过本地代理）
   */
  async connect() {
    if (this.state !== ConnectionState.DISCONNECTED) {
      console.warn('Already connected or connecting')
      return
    }

    this._setState(ConnectionState.CONNECTING)

    try {
      // 初始化音频播放器
      await this.audioPlayer.init()

      // 构建WebSocket URL，将认证参数通过查询参数传递给代理服务器
      const url = new URL(this.config.url)
      url.searchParams.set('appid', this.config.appId)
      url.searchParams.set('accessKey', this.config.accessKey)

      // 建立WebSocket连接到本地代理
      this.ws = new WebSocket(url.toString())
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => this._handleOpen()
      this.ws.onmessage = (e) => this._handleMessage(e)
      this.ws.onerror = (e) => this._handleError(e)
      this.ws.onclose = () => this._handleClose()

    } catch (error) {
      this._setState(ConnectionState.ERROR)
      this.config.onError(error)
    }
  }

  /**
   * 开始会话
   */
  async startSession() {
    if (this.state !== ConnectionState.CONNECTED) {
      throw new Error('Not connected. Call connect() first.')
    }

    // 初始化音频采集
    const success = await this.audioCapture.init()
    if (!success) {
      throw new Error('Failed to initialize audio capture')
    }

    // 构建会话配置 (参考 example/python3.7/config.py)
    const sessionConfig = {
      asr: {
        extra: {
          end_smooth_window_ms: 1500,
        },
      },
      tts: {
        speaker: this.config.speaker,
        audio_config: {
          channel: 1,
          format: 'pcm',
          sample_rate: 24000
        },
      },
      dialog: {
        bot_name: this.config.botName,
        system_role: this.config.systemRole,
        speaking_style: this.config.speakingStyle,
        extra: {
          strict_audit: false,
          recv_timeout: 10,
          input_mod: 'audio',
          model: 'O'  // 必传参数: O, SC, 1.2.1.0, 或 2.2.0.0
        }
      }
    }

    // 发送StartSession事件
    const message = createStartSessionMessage(this.sessionId, sessionConfig)
    this._send(message)
  }

  /**
   * 开始麦克风输入
   */
  startMicrophone() {
    console.log('=== startMicrophone called ===')
    console.log('audioCapture:', this.audioCapture)
    this.audioCapture.start(
      (audioData) => this._sendAudio(audioData),
      (error) => this.config.onError(error)
    )
  }

  /**
   * 停止麦克风输入
   */
  stopMicrophone() {
    this.audioCapture.stop()
  }

  /**
   * 发送文本输入
   */
  sendText(text) {
    if (this.state !== ConnectionState.SESSION_STARTED) {
      console.warn('Session not started')
      return
    }

    const message = createChatTextQueryMessage(this.sessionId, text)
    this._send(message)
  }

  /**
   * 结束会话
   */
  endSession() {
    if (this.state !== ConnectionState.SESSION_STARTED) {
      return
    }

    this.audioCapture.stop()

    const message = createFinishSessionMessage(this.sessionId)
    this._send(message)
  }

  /**
   * 断开连接
   */
  async disconnect() {
    console.log('=== Disconnecting... ===')

    // 停止麦克风
    this.audioCapture.stop()

    // 发送结束会话消息
    if (this.state === ConnectionState.SESSION_STARTED) {
      const finishSessionMsg = createFinishSessionMessage(this.sessionId)
      this._send(finishSessionMsg)
    }

    // 发送结束连接消息
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = createFinishConnectionMessage()
      this._send(message)
    }

    // 释放音频资源
    await this.audioCapture.dispose()
    console.log('Audio capture disposed')

    setTimeout(() => {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      this._setState(ConnectionState.DISCONNECTED)
      console.log('=== Disconnected ===')
    }, 100)
  }

  /**
   * 设置音量
   */
  setVolume(volume) {
    this.audioPlayer.setVolume(volume)
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.state
  }

  // ========== 私有方法 ==========

  _handleOpen() {
    // 发送StartConnection事件
    const message = createStartConnectionMessage()
    this._send(message)
  }

  _handleMessage(event) {
    console.log('=== Received WebSocket message ===')
    console.log('Raw data length:', event.data.byteLength)
    const data = new Uint8Array(event.data)
    console.log('First 20 bytes:', Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '))

    const message = decodeMessage(data)
    console.log('Decoded message:', JSON.stringify(message, (key, value) => {
      if (value instanceof Uint8Array) return `[Uint8Array(${value.length})]`
      return value
    }, 2))

    console.log('Received message:', message.message_type, 'event:', message.event)

    // 处理 SERVER_ACK (音频数据)
    if (message.message_type === SERVER_ACK) {
      if (!this.isClearingAudio && message.payload_msg instanceof Uint8Array) {
        this._playAudioResponse(message.payload_msg)
      }
      return
    }

    // 处理 SERVER_FULL_RESPONSE (事件消息)
    if (message.message_type === SERVER_FULL_RESPONSE) {
      this._handleEvent(message)
    }

    // 处理错误
    if (message.message_type === SERVER_ERROR_RESPONSE) {
      this._setState(ConnectionState.ERROR)
      let errorMsg = 'Server error'
      if (message.payload_msg) {
        if (typeof message.payload_msg === 'string') {
          errorMsg = message.payload_msg
        } else if (typeof message.payload_msg === 'object') {
          errorMsg = JSON.stringify(message.payload_msg)
        }
      }
      console.error('Server error:', errorMsg, 'code:', message.code)
      this.config.onError(new Error(errorMsg))
    }
  }

  _handleEvent(message) {
    const event = message.event
    const payloadMsg = message.payload_msg || {}

    console.log('Event:', event, payloadMsg)
    console.log('CONNECTION_STARTED constant value:', CONNECTION_STARTED)
    console.log('Event === CONNECTION_STARTED:', event === CONNECTION_STARTED)

    switch (event) {
      case CONNECTION_STARTED:
        console.log('=== CONNECTION_STARTED matched! Setting state to CONNECTED ===')
        this._setState(ConnectionState.CONNECTED)
        break

      case SESSION_STARTED:
        this.dialogId = payloadMsg.dialog_id || ''
        this._setState(ConnectionState.SESSION_STARTED)
        break

      case SESSION_FINISHED:
        this._setState(ConnectionState.CONNECTED)
        break

      case CLEAR_AUDIO:
        // 清空音频缓存
        console.log('Clearing audio queue')
        this.audioQueue = []
        this.isClearingAudio = true
        this.audioPlayer.stop()
        break

      case USER_QUERY_END:
        // 用户查询结束，可以继续播放音频
        this.isClearingAudio = false
        this._playNextInQueue()
        break

      case TTS_ENDED:
        // TTS 播放结束
        console.log('TTS ended')
        break

      default:
        console.log('Unhandled event:', event, payloadMsg)
    }
  }

  _handleError(event) {
    console.error('WebSocket error:', event)
    this._setState(ConnectionState.ERROR)
    this.config.onError(new Error('WebSocket error'))
  }

  _handleClose() {
    this._setState(ConnectionState.DISCONNECTED)
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.warn('Cannot send: WebSocket not open, state:', this.ws?.readyState)
    }
  }

  _sendAudio(audioData) {
    // 每 100 个包打印一次日志
    if (!this._audioPacketCount) this._audioPacketCount = 0
    this._audioPacketCount++
    if (this._audioPacketCount % 100 === 0) {
      console.log(`Sending audio packet #${this._audioPacketCount}, size: ${audioData.length}, ws state: ${this.ws?.readyState}`)
    }

    const message = createAudioMessage(this.sessionId, audioData)
    this._send(message)
  }

  async _playAudioResponse(audioData) {
    // 将音频加入队列
    this.audioQueue.push(audioData)

    if (!this.isPlayingQueue) {
      this._playNextInQueue()
    }
  }

  async _playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlayingQueue = false
      return
    }

    this.isPlayingQueue = true
    const audioData = this.audioQueue.shift()
    console.log('Playing audio chunk, queue remaining:', this.audioQueue.length)

    try {
      // audioData 是 PCM 格式 (float32, 24000Hz)
      await this.audioPlayer.play(audioData, 'pcm')
      console.log('Audio chunk finished playing')
    } catch (error) {
      console.error('Audio playback error:', error)
    }

    // 播放下一段
    this._playNextInQueue()
  }

  _setState(newState) {
    console.log('_setState called:', { currentState: this.state, newState })
    if (this.state !== newState) {
      console.log('State changed from', this.state, 'to', newState)
      this.state = newState
      console.log('Calling onStateChange callback...')
      this.config.onStateChange(newState)
      console.log('onStateChange callback completed')
    } else {
      console.log('State unchanged, skipping update')
    }
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * 释放资源
   */
  async dispose() {
    this.disconnect()
    await this.audioCapture.dispose()
    await this.audioPlayer.dispose()
    this.audioQueue = []
  }
}
