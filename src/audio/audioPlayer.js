// 音频播放器 - 播放服务器返回的音频
// 支持格式: OGG/Opus (默认), PCM (24000Hz, mono, int16/float32)

/**
 * 音频播放器类
 */
export class AudioPlayer {
  constructor() {
    this.audioContext = null
    this.audioQueue = []
    this.isPlaying = false
    this.currentSource = null
    this.sampleRate = 24000
    this.gainNode = null
    this.volume = 1.0
    this.onEndedCallback = null
  }

  /**
   * 初始化播放器
   */
  async init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate
    })

    // 创建增益节点用于控制音量
    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.value = this.volume
    this.gainNode.connect(this.audioContext.destination)
  }

  /**
   * 播放音频数据
   * @param {Uint8Array} audioData - 音频数据
   * @param {string} format - 音频格式 ('opus' 或 'pcm')
   */
  async play(audioData, format = 'opus') {
    if (!this.audioContext) {
      await this.init()
    }

    // 恢复AudioContext (某些浏览器需要用户交互后才能播放)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    if (format === 'opus') {
      await this._playOpus(audioData)
    } else {
      await this._playPCM(audioData)
    }
  }

  /**
   * 播放Opus音频 (OGG封装)
   * @private
   */
  async _playOpus(audioData) {
    try {
      // 创建Blob并播放
      const blob = new Blob([audioData], { type: 'audio/ogg; codecs=opus' })
      const url = URL.createObjectURL(blob)

      if (this.currentSource) {
        this.currentSource.stop()
      }

      const audioElement = new Audio()
      audioElement.src = url

      audioElement.onended = () => {
        URL.revokeObjectURL(url)
        this.isPlaying = false
        if (this.onEndedCallback) {
          this.onEndedCallback()
        }
      }

      audioElement.play()
      this.isPlaying = true
    } catch (error) {
      console.error('Failed to play Opus audio:', error)
      throw error
    }
  }

  /**
   * 播放PCM音频
   * @private
   */
  async _playPCM(audioData) {
    console.log('Playing PCM audio, data length:', audioData.length, 'bytes')

    return new Promise((resolve, reject) => {
      try {
        // 将Uint8Array转换为AudioBuffer
        const samples = audioData.length / 4
        const buffer = new ArrayBuffer(audioData.length)
        const view = new Uint8Array(buffer)
        view.set(audioData)
        const float32Array = new Float32Array(buffer)

        const audioBuffer = this.audioContext.createBuffer(1, samples, this.sampleRate)
        audioBuffer.getChannelData(0).set(float32Array)

        // 创建音频源
        const source = this.audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(this.gainNode)

        source.onended = () => {
          this.isPlaying = false
          resolve()
        }

        source.start()
        this.isPlaying = true
        this.currentSource = source
      } catch (error) {
        console.error('Failed to play PCM audio:', error)
        reject(error)
      }
    })
  }

  /**
   * 解码PCM数据为AudioBuffer
   * 服务器返回的是 Float32 格式 (24000Hz, mono)
   * @private
   */
  async _decodePCM(audioData) {
    // 服务器返回的是 Float32 格式 (每个样本 4 字节)
    const samples = audioData.length / 4

    // 将 Uint8Array 转换为 Float32Array
    // 注意：需要复制数据以确保正确对齐
    const buffer = new ArrayBuffer(audioData.length)
    const view = new Uint8Array(buffer)
    view.set(audioData)
    const float32Array = new Float32Array(buffer)

    // 创建 AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(1, samples, this.sampleRate)
    audioBuffer.getChannelData(0).set(float32Array)

    return audioBuffer
  }

  /**
   * 停止播放
   */
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (e) {
        // 忽略错误
      }
      this.currentSource = null
    }
    this.isPlaying = false
  }

  /**
   * 设置音量
   * @param {number} volume - 音量 (0.0 - 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume
    }
  }

  /**
   * 获取当前音量
   */
  getVolume() {
    return this.volume
  }

  /**
   * 设置播放结束回调
   */
  onEnded(callback) {
    this.onEndedCallback = callback
  }

  /**
   * 释放资源
   */
  async dispose() {
    this.stop()
    this.audioQueue = []

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.gainNode = null
    this.onEndedCallback = null
  }
}
