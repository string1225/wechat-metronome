# Pocket Groove

一个给架子鼓练习用的微信小程序 MVP：节拍器、简单 groove/手法练习、可视化节奏网格和基础合成音色。

## 当前方案

- 首页即练习台，不做登录、云端和复杂曲库。
- 使用 `wx.createWebAudioContext` 合成短音色：重拍、普通 click、底鼓、军鼓、踩镲和 rim。
- 如果当前环境不支持 WebAudio，会保留视觉提示和震动提示。
- 练习内容由 `utils/patterns.js` 驱动，新增节奏只需要补一个 pattern 对象。
- 计时采用 look-ahead 调度，比直接 `setInterval` 更适合节拍器场景。

## 已内置练习

- 四分内稳
- 八分摇滚
- 十六分手法
- Shuffle 后拍
- Paradiddle

## 运行

1. 打开微信开发者工具。
2. 导入当前目录 `C:\Users\junte\Code\wechat-metronome`。
3. AppID 可以先使用测试号或保持 `touristappid`。
4. 在模拟器或真机预览里点击「开始」。

## 后续可以加的东西

- Tap tempo。
- 倒计时和自动加速练习。
- 自定义小节、重音和手序编辑器。
- 练习记录、本地收藏和分享节奏。
- 更像真实鼓机的采样音色。

## 参考

- [wx.createWebAudioContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createWebAudioContext.html)
- [wx.createInnerAudioContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createInnerAudioContext.html)
