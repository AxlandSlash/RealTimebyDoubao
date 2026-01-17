// 音频采集器 - 使用 Web Audio API 采集麦克风音频
// 需求: PCM, 单声道, 采样率16000Hz, int16, 小端序

const TARGET_SAMPLE_RATE = 16000
const CHANNEL_COUNT = 1
const BITS_PER_SAMPLE = 16

/**
 * 音频采集器类
 */
export class AudioCapture {
  constructor() {
    this.stream = null
    this.audioContext = null
    this.source = null
    this.processor = null
    this.isCapturing = false
    this.onDataCallback = null
    this.onErrorCallback = null
    this.sequence = 0
    this.nativeSampleRate = 48000 // 会在 init 中更新
  }

  /**
   * 初始化音频采集
   */
  async init() {
    try {
      // 获取麦克风流
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: CHANNEL_COUNT,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // 创建AudioContext (使用浏览器原生采样率)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      this.nativeSampleRate = this.audioContext.sampleRate
      console.log('Native sample rate:', this.nativeSampleRate)

      // 创建音频源
      this.source = this.audioContext.createMediaStreamSource(this.stream)

      // 创建脚本处理器
      // bufferSize 必须是 2 的幂次方
      // 使用 4096 以获取更多样本用于重采样
      const bufferSize = 4096
      this.processor = this.audioContext.createScriptProcessor(bufferSize, CHANNEL_COUNT, CHANNEL_COUNT)

      console.log('Audio capture initialized, buffer size:', bufferSize)
      return true
    } catch (error) {
      this._handleError(error)
      return false
    }
  }

  /**
   * 开始采集
   * @param {Function} onData - 音频数据回调 (audioData: Uint8Array)
   * @param {Function} onError - 错误回调
   */
  start(onData, onError) {
    console.log('=== audioCapture.start() called ===')
    console.log('processor:', this.processor)
    console.log('source:', this.source)
    console.log('audioContext:', this.audioContext)

    if (!this.processor) {
      console.error('Processor not initialized! Call init() first.')
      if (onError) onError(new Error('Processor not initialized'))
      return
    }

    if (this.isCapturing) {
      console.warn('Audio capture is already running')
      return
    }

    console.log('=== Starting audio capture ===')
    this.onDataCallback = onData
    this.onErrorCallback = onError
    this.sequence = 0

    let packetCount = 0
    this.processor.onaudioprocess = (e) => {
      if (!this.isCapturing) return

      const inputData = e.inputBuffer.getChannelData(0)

      // 重采样到 16kHz
      const resampledData = this._resample(inputData, this.nativeSampleRate, TARGET_SAMPLE_RATE)
      const pcmData = this._convertToPCM16(resampledData)

      // 每 50 个包打印一次日志
      if (packetCount % 50 === 0) {
        console.log(`Audio capture: sent ${packetCount} packets, size: ${pcmData.length} bytes, native rate: ${this.nativeSampleRate}`)
      }

      // 分包发送 (推荐20ms一包)
      const chunkSize = 640 // 20ms @ 16kHz, int16 = 640 bytes
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        const chunk = pcmData.slice(i, Math.min(i + chunkSize, pcmData.length))
        if (this.onDataCallback) {
          this.onDataCallback(chunk, this.sequence++)
        }
        packetCount++
      }
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
    this.isCapturing = true
    console.log('=== Audio capture started ===')
  }

  /**
   * 停止采集
   */
  stop() {
    this.isCapturing = false

    if (this.processor) {
      this.processor.onaudioprocess = null
      this.processor.disconnect()
    }

    if (this.source) {
      this.source.disconnect()
    }
  }

  /**
   * 释放资源
   */
  async dispose() {
    this.stop()

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.source = null
    this.processor = null
  }

  /**
   * 将Float32Array转换为PCM16 (int16) 小端序
   * @private
   */
  _convertToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      // 将 [-1, 1] 映射到 [-32768, 32767]
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    }
    return new Uint8Array(int16Array.buffer)
  }

  /**
   * 重采样音频数据
   * @private
   */
  _resample(inputData, fromRate, toRate) {
    if (fromRate === toRate) {
      return inputData
    }

    const ratio = fromRate / toRate
    const newLength = Math.round(inputData.length / ratio)
    const result = new Float32Array(newLength)

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1)
      const t = srcIndex - srcIndexFloor

      // 线性插值
      result[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t
    }

    return result
  }

  /**
   * 错误处理
   * @private
   */
  _handleError(error) {
    console.error('Audio capture error:', error)
    if (this.onErrorCallback) {
      this.onErrorCallback(error)
    }
  }

  /**
   * 从文件读取音频数据
   * @param {File} file - 音频文件
   * @returns {Promise<Uint8Array>} PCM16数据
   */
  static async fromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result
          const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE
          })

          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          // 转换为单声道
          const offlineContext = new OfflineAudioContext(
            CHANNEL_COUNT,
            audioBuffer.duration * SAMPLE_RATE,
            SAMPLE_RATE
          )

          const source = offlineContext.createBufferSource()
          source.buffer = audioBuffer
          source.connect(offlineContext.destination)
          source.start()

          const renderedBuffer = await offlineContext.startRendering()
          const channelData = renderedBuffer.getChannelData(0)

          // 转换为PCM16
          const int16Array = new Int16Array(channelData.length)
          for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]))
            int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
          }

          await audioContext.close()
          resolve(new Uint8Array(int16Array.buffer))
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * 流式发送文件音频数据
   * @param {File} file - 音频文件
   * @param {Function} onData - 音频数据回调
   * @param {number} chunkSizeMs - 每包大小(毫秒), 默认20ms
   */
  static async streamFile(file, onData, chunkSizeMs = 20) {
    const pcmData = await AudioCapture.fromFile(file)
    const chunkSize = Math.floor(SAMPLE_RATE * (chunkSizeMs / 1000) * 2) // bytes per chunk

    for (let i = 0; i < pcmData.length; i += chunkSize) {
      const chunk = pcmData.slice(i, Math.min(i + chunkSize, pcmData.length))
      onData(chunk, Math.floor(i / chunkSize))

      // 模拟实时发送，休眠相同时间
      await new Promise(resolve => setTimeout(resolve, chunkSizeMs))
    }
  }
}
