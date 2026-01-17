import { useState, useEffect, useRef } from 'react'
import { VoiceCallService, ConnectionState } from '../services/voiceCallService'

import './VoiceCallApp.css'

export default function VoiceCallApp() {
  // API配置
  const [appId, setAppId] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [model, setModel] = useState('O')
  const [speaker, setSpeaker] = useState('zh_female_vv_jupiter_bigtts')
  const [botName, setBotName] = useState('豆包')
  const [systemRole, setSystemRole] = useState('')
  const [speakingStyle, setSpeakingStyle] = useState('')

  // 连接状态
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED)
  const [dialogId, setDialogId] = useState('')

  // 对话内容
  const [transcripts, setTranscripts] = useState([])
  const [responses, setResponses] = useState([])
  const [textInput, setTextInput] = useState('')

  // UI状态
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [showSettings, setShowSettings] = useState(true)
  const [error, setError] = useState(null)

  // 服务引用
  const serviceRef = useRef(null)
  const chatEndRef = useRef(null)

  // 追踪 connectionState 变化
  useEffect(() => {
    console.log('=== useEffect: connectionState changed to:', connectionState)
  }, [connectionState])

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts, responses])

  // 清理资源
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.dispose()
      }
    }
  }, [])

  // 连接到服务器
  const handleConnect = async () => {
    if (!appId || !accessKey) {
      setError('请填写 App ID 和 Access Key')
      return
    }

    setError(null)
    setConnectionState(ConnectionState.CONNECTING)

    try {
      const service = new VoiceCallService({
        appId,
        accessKey,
        model,
        speaker,
        botName,
        systemRole,
        speakingStyle,
        dialogId,
        onStateChange: (state) => {
          console.log('=== React onStateChange received:', state)
          setConnectionState(state)
          console.log('=== setConnectionState called with:', state)
          if (state === ConnectionState.SESSION_STARTED) {
            setShowSettings(false)
          }
        },
        onTranscript: (text) => {
          setTranscripts(prev => [...prev, { role: 'user', text, time: new Date() }])
        },
        onResponse: (text) => {
          setResponses(prev => [...prev, { role: 'assistant', text, time: new Date() }])
        },
        onError: (err) => {
          setError(err.message || '发生错误')
        }
      })

      serviceRef.current = service
      await service.connect()
    } catch (err) {
      setError(err.message)
      setConnectionState(ConnectionState.ERROR)
    }
  }

  // 开始通话
  const handleStartCall = async () => {
    if (!serviceRef.current) return

    try {
      await serviceRef.current.startSession()
      serviceRef.current.startMicrophone()
    } catch (err) {
      setError(err.message)
    }
  }

  // 结束通话
  const handleEndCall = () => {
    if (serviceRef.current) {
      serviceRef.current.endSession()
      setShowSettings(true)
    }
  }

  // 断开连接
  const handleDisconnect = () => {
    if (serviceRef.current) {
      serviceRef.current.disconnect()
      setConnectionState(ConnectionState.DISCONNECTED)
      setShowSettings(true)
      setTranscripts([])
      setResponses([])
    }
  }

  // 发送文本
  const handleSendText = () => {
    if (!textInput.trim() || !serviceRef.current) return

    serviceRef.current.sendText(textInput)
    setTranscripts(prev => [...prev, { role: 'user', text: textInput, time: new Date() }])
    setTextInput('')
  }

  // 切换静音
  const handleToggleMute = () => {
    if (!serviceRef.current) return

    setIsMuted(!isMuted)
    if (isMuted) {
      serviceRef.current.startMicrophone()
    } else {
      serviceRef.current.stopMicrophone()
    }
  }

  // 处理文件上传
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !serviceRef.current) return

    try {
      await serviceRef.current.sendAudioFile(file)
    } catch (err) {
      setError(err.message)
    }
  }

  // 音量控制
  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value)
    setVolume(newVolume)
    if (serviceRef.current) {
      serviceRef.current.setVolume(newVolume / 100)
    }
  }

  // 获取状态文本
  const getStateText = () => {
    switch (connectionState) {
      case ConnectionState.DISCONNECTED: return '未连接'
      case ConnectionState.CONNECTING: return '连接中...'
      case ConnectionState.CONNECTED: return '已连接'
      case ConnectionState.SESSION_STARTED: return '通话中'
      case ConnectionState.ERROR: return '连接错误'
      default: return ''
    }
  }

  // 获取状态颜色
  const getStateColor = () => {
    switch (connectionState) {
      case ConnectionState.DISCONNECTED: return '#6b7280'
      case ConnectionState.CONNECTING: return '#f59e0b'
      case ConnectionState.CONNECTED: return '#3b82f6'
      case ConnectionState.SESSION_STARTED: return '#10b981'
      case ConnectionState.ERROR: return '#ef4444'
      default: return '#6b7280'
    }
  }

  // 合并用户和助手消息
  const allMessages = [...transcripts, ...responses]
    .sort((a, b) => a.time - b.time)

  return (
    <div className="voice-call-app">
      {/* 设置面板 */}
      {showSettings && (
        <div className="settings-panel">
          <h2>豆包实时语音通话</h2>

          <div className="form-group">
            <label>App ID *</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="请输入火山引擎控制台获取的 App ID"
            />
          </div>

          <div className="form-group">
            <label>Access Key *</label>
            <input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="请输入火山引擎控制台获取的 Access Key"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>模型版本</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="O">O 版本 (精品音色)</option>
                <option value="SC">SC 版本 (声音复刻)</option>
                <option value="1.2.1.0">O2.0 版本</option>
                <option value="2.2.0.0">SC2.0 版本</option>
              </select>
            </div>

            <div className="form-group">
              <label>音色</label>
              <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                <option value="zh_female_vv_jupiter_bigtts">vv (活泼灵动女声)</option>
                <option value="zh_female_xiaohe_jupiter_bigtts">xiaohe (甜美活泼女声)</option>
                <option value="zh_male_yunzhou_jupiter_bigtts">yunzhou (清爽沉稳男声)</option>
                <option value="zh_male_xiaotian_jupiter_bigtts">xiaotian (清爽磁性男声)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>助手名称</label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="默认: 豆包"
              />
            </div>

            <div className="form-group">
              <label>对话ID (续接对话)</label>
              <input
                type="text"
                value={dialogId}
                onChange={(e) => setDialogId(e.target.value)}
                placeholder="留空则开启新对话"
              />
            </div>
          </div>

          <div className="form-group">
            <label>角色设定 (O版本)</label>
            <textarea
              value={systemRole}
              onChange={(e) => setSystemRole(e.target.value)}
              placeholder="例如: 你是大灰狼、用户是小红帽，用户逃跑时你会威胁吃掉他。"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>说话风格 (O版本)</label>
            <input
              type="text"
              value={speakingStyle}
              onChange={(e) => setSpeakingStyle(e.target.value)}
              placeholder="例如: 你说话偏向林黛玉"
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* 按钮区域 */}
          {connectionState === ConnectionState.DISCONNECTED && (
            <button
              className="btn btn-primary"
              onClick={handleConnect}
            >
              连接
            </button>
          )}

          {connectionState === ConnectionState.CONNECTING && (
            <button
              className="btn btn-primary"
              disabled
            >
              连接中...
            </button>
          )}

          {connectionState === ConnectionState.CONNECTED && (
            <button
              className="btn btn-success"
              onClick={handleStartCall}
            >
              ✅ 已连接 - 开始通话
            </button>
          )}

          {connectionState === ConnectionState.SESSION_STARTED && (
            <button
              className="btn btn-danger"
              onClick={handleEndCall}
            >
              🎤 通话中 - 点击结束
            </button>
          )}
        </div>
      )}

      {/* 通话界面 */}
      {!showSettings && (
        <div className="call-interface">
          {/* 状态栏 */}
          <div className="status-bar" style={{ backgroundColor: getStateColor() }}>
            <span className="status-text">{getStateText()}</span>
            <button className="btn-back" onClick={() => setShowSettings(true)}>
              返回设置
            </button>
          </div>

          {/* 对话记录 */}
          <div className="chat-container">
            {allMessages.length === 0 ? (
              <div className="chat-empty">
                <div className="avatar-placeholder">
                  {botName.charAt(0)}
                </div>
                <p>开始对话吧...</p>
              </div>
            ) : (
              allMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
                  <div className="message-bubble">
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 控制面板 */}
          <div className="control-panel">
            <div className="control-row">
              {/* 静音按钮 */}
              <button
                className={`btn-control ${isMuted ? 'muted' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? '取消静音' : '静音'}
              >
                {isMuted ? '🎤' : '🔇'}
              </button>

              {/* 挂断/开始按钮 */}
              {connectionState === ConnectionState.SESSION_STARTED ? (
                <button className="btn-hangup" onClick={handleEndCall}>
                  📞 挂断
                </button>
              ) : (
                <button className="btn-call" onClick={handleStartCall}>
                  📞 开始通话
                </button>
              )}

              {/* 音量控制 */}
              <div className="volume-control">
                <span>🔊</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
                <span className="volume-value">{volume}%</span>
              </div>
            </div>

            {/* 文本输入 */}
            <div className="text-input-row">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="输入文字消息..."
                className="text-input"
              />
              <button className="btn-send" onClick={handleSendText}>
                发送
              </button>
            </div>

            {/* 文件上传 */}
            <div className="file-upload">
              <label className="btn-upload">
                📁 上传音频文件
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 断开连接确认 */}
      {connectionState !== ConnectionState.DISCONNECTED && (
        <button className="btn-disconnect" onClick={handleDisconnect}>
          断开连接
        </button>
      )}
    </div>
  )
}
