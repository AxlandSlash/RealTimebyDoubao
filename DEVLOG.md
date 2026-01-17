# 开发日志 - RealTimeVoice

## 2026-01-17：项目调试与功能实现

### 项目概述
基于豆包端到端实时语音大模型 API 的语音通话应用。使用 React + Vite 构建前端，Node.js WebSocket 代理服务器转发请求。

### 已解决的问题

#### 1. WebSocket 消息时序问题
**问题**：前端在代理服务器连接 API 之前就发送消息，导致消息丢失。
**解决方案**：在 `server.js` 中添加消息队列（`messageQueue`）和 `apiReady` 标志，在 API 连接就绪后才发送缓存的消息。

#### 2. 二进制协议解析错误
**问题**：`decodeMessage` 函数出现 `Offset is outside the bounds of the DataView` 错误。
**解决方案**：重写 `binaryProtocol.js` 中的 `decodeMessage` 函数，使用数组切片（slice）代替绝对偏移量进行数据解析。

#### 3. UI 状态更新问题
**问题**：连接成功后，UI 没有正确更新按钮状态。
**解决方案**：修改 `VoiceCallApp.jsx` 中的按钮渲染逻辑，根据不同连接状态（DISCONNECTED/CONNECTING/CONNECTED/SESSION_STARTED）显示不同的按钮。

#### 4. 音频采集缓冲区大小错误
**问题**：`createScriptProcessor` 的 bufferSize 必须是 2 的幂次方，但代码中使用了 320。
**解决方案**：将 `audioCapture.js` 中的 `bufferSize` 改为 4096。

#### 5. 音频播放格式错误
**问题**：服务器返回的是 Float32 格式的 PCM 数据，但播放器按 Int16 处理，导致恐怖噪音。
**解决方案**：修改 `audioPlayer.js` 中的 `_playPCM` 函数，正确处理 Float32 格式（每样本 4 字节）。

#### 6. 采样率不匹配
**问题**：Web Audio API 不支持 16kHz 采样率，实际使用的是 48kHz。
**解决方案**：在 `audioCapture.js` 中添加 `_resample` 函数，将原生 48kHz 音频重采样到 16kHz 后发送。

#### 7. StartSession 缺少必传参数
**问题**：根据 API 文档，`model` 字段是必传参数。
**解决方案**：在 `voiceCallService.js` 的 sessionConfig 中添加 `model: 'O'` 参数。

#### 8. 麦克风资源未释放
**问题**：断开连接后麦克风仍处于激活状态。
**解决方案**：在 `disconnect` 方法中调用 `audioCapture.dispose()` 释放资源。

### 项目架构

```
RealTimeVoice/
├── src/
│   ├── components/
│   │   ├── VoiceCallApp.jsx    # 主要 UI 组件
│   │   └── VoiceCallApp.css    # 样式
│   ├── services/
│   │   └── voiceCallService.js # WebSocket 通信与业务逻辑
│   ├── protocol/
│   │   └── binaryProtocol.js   # 二进制协议编解码
│   ├── audio/
│   │   ├── audioCapture.js     # 麦克风音频采集（含重采样）
│   │   └── audioPlayer.js      # 音频播放（Float32 PCM）
│   └── App.jsx
├── server.js                    # WebSocket 代理服务器
└── package.json
```

### 启动方式

**终端 1 - 代理服务器：**
```bash
node server.js
```

**终端 2 - 前端开发服务器：**
```bash
npm run dev
```

### 技术栈
- **前端**: React 18 + Vite
- **协议**: WebSocket + 自定义二进制协议
- **音频**: Web Audio API
- **压缩**: pako (gzip)
- **代理**: ws (Node.js WebSocket)

### API 信息
- **端点**: wss://openspeech.bytedance.com/api/v3/realtime/dialogue
- **认证**: X-Api-App-ID, X-Api-Access-Key
- **输入音频**: PCM, 16kHz, mono, int16, 小端序
- **输出音频**: PCM, 24kHz, mono, float32

### 功能状态
- ✅ WebSocket 连接
- ✅ 二进制协议编解码
- ✅ 文字消息发送
- ✅ 语音输入（麦克风）
- ✅ 语音输出（AI 回复）
- ✅ 音量控制
- ✅ 状态管理

---
*最后更新: 2026-01-17 14:07*
