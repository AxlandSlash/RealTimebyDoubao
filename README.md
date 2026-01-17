# 豆包实时语音通话前端（纯vibe coding）

基于豆包端到端实时语音大模型 API 的语音通话应用。

## 功能特性

- **实时语音对话**：通过麦克风与 AI 进行实时语音交流
- **文本输入**：支持纯文本模式对话
- **音频文件上传**：支持上传录音文件进行对话
- **多音色选择**：支持多种精品音色（vv、xiaohe、yunzhou、xiaotian）
- **自定义人设**：可配置 AI 的角色设定和说话风格
- **对话记忆**：支持通过 dialog_id 续接历史对话
- **音量控制**：可调节 AI 语音播放音量
- **静音功能**：支持麦克风静音

## 项目结构

```
RealTimeVoice/
├── src/
│   ├── protocol/
│   │   └── binaryProtocol.js      # WebSocket 二进制协议编解码
│   ├── audio/
│   │   ├── audioCapture.js        # 音频采集（麦克风）
│   │   └── audioPlayer.js         # 音频播放
│   ├── services/
│   │   └── voiceCallService.js    # 语音通话服务
│   ├── components/
│   │   ├── VoiceCallApp.jsx       # 主应用组件
│   │   └── VoiceCallApp.css       # 样式
│   └── main.jsx                   # 入口文件
├── index.html                     # HTML 模板
├── vite.config.js                 # Vite 配置
└── package.json                   # 依赖配置
```

## 安装和运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 使用说明

### 1. 获取 API 凭证

访问 [火山引擎控制台](https://console.volcengine.com/) 获取：
- **App ID**：应用标识
- **Access Key**：访问密钥

### 2. 配置应用

在设置面板中填写：
- App ID 和 Access Key（必填）
- 选择模型版本（O、SC、O2.0、SC2.0）
- 选择音色
- 配置助手名称、角色设定等

### 3. 开始通话

点击"连接"按钮建立连接，然后点击"开始通话"即可开始语音对话。

## 技术栈

- **前端框架**：React 18
- **构建工具**：Vite
- **音频处理**：Web Audio API
- **网络通信**：WebSocket

## API 说明

### 音频格式要求

**输入音频**：
- 格式：PCM（未压缩）
- 采样率：16000 Hz
- 声道：单声道
- 位深：int16
- 字节序：小端序

**输出音频**：
- 格式：OGG 封装的 Opus（默认）
- 或 PCM（24000 Hz, mono）

### WebSocket 端点

```
wss://openspeech.bytedance.com/api/v3/realtime/dialogue
```

### 请求头

```
X-Api-App-ID: <your-app-id>
X-Api-Access-Key: <your-access-key>
X-Api-Resource-Id: volc.speech.dialog
X-Api-App-Key: PlgvMymc7f3tQnJ6
```

## 协议格式

使用二进制协议，格式如下：

```
[Header(4)] [Optional] [PayloadSize(4)] [Payload]
```

详见 `src/protocol/binaryProtocol.js`

## 模型版本说明

| 版本 | 特点 |
|------|------|
| O | 支持精品音色（vv、xiaohe、yunzhou、xiaotian） |
| SC | 支持声音复刻（克隆音色 1.0） |
| 1.2.1.0 | O2.0 版本，能力增强，支持唱歌 |
| 2.2.0.0 | SC2.0 版本，角色演绎能力提升 |

## 注意事项

1. 浏览器需要支持 Web Audio API 和 WebSocket
2. 首次使用需要用户授权麦克风权限
3. 推荐使用 Chrome 或 Edge 浏览器
4. 音频数据按 20ms 分包发送（推荐）
