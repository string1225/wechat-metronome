# 架子鼓练习助手

一个给鼓手日常练习用的微信小程序 MVP：先做好基础节拍器，再围绕架子鼓单击、节奏组合和连续换档练习提供辅助。

## 当前方向

- 基础节拍器优先：4/4、BPM 控制、开始/停止、重拍视觉提示。
- 架子鼓练习围绕单击和节奏组合展开：右左交替、四分参照、细分网格、当前落点高亮。
- 连续练习支持从 8 分到 32 分再回到 8 分，每种 4 小节。
- 练习内容由 `utils/patterns.js` 数据驱动，后续新增练习只需要增加一个模式数据。
- 音频使用 `wx.createWebAudioContext` 合成短促 click/rim 音色。
- 当前环境不支持 WebAudio 时，保留视觉提示。
- 计时采用 look-ahead 调度，比直接 `setInterval` 更适合节拍器场景。

## 已内置练习

### 单击练习

- 8分音符单击
- 三连音单击
- 16分音符单击
- 5连音单击
- 6连音单击
- 7连音单击
- 32分音符单击

### 节奏练习

- 前八后十六：16 分底板第 1/3/4 格落槌。
- 前16后八：16 分底板第 1/2/3 格落槌。
- 8分切分：16 分底板第 1/2/4 格落槌。
- 8分前附点：16 分底板第 1/4 格落槌。
- 8分后附点：16 分底板第 1/2 格落槌。

### 连续练习

- 连续打：8分、三连、16分、5连、6连、7连、32分，再从32分回到8分，每种4小节。
- 空1小节：同样的上行下行流程，但每种练习之间插入1小节空拍，只保留四分参照。

## 运行

1. 打开微信开发者工具。
2. 导入当前目录 `C:\Users\junte\Code\wechat-metronome`。
3. AppID 使用 `project.config.json` 中配置的值，也可以按需要换成测试号。
4. 在模拟器或真机预览里点击「开始」。

## 资源

- 头像素材：`assets/drum-practice-assistant-avatar.jpg`

## 后续可以加的东西

- Tap tempo。
- 自动加速练习。
- 练习倒计时和阶段目标。
- 重音位编辑，例如每组第 1 下、第 2 下轮换。
- 练习记录、本地收藏和分享。

## 参考

- [wx.createWebAudioContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createWebAudioContext.html)
- [wx.createInnerAudioContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createInnerAudioContext.html)
