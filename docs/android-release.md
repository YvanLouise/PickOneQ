# 拾一问 Android 打包与线上发布

双击项目根目录的 `打开安卓打包发布工具.cmd`，或运行：

```powershell
npm run android:release
```

## 发布链路

拾一问的前端依赖 Node 服务保存数据、调用 DeepSeek 和提前生成问题，因此 Android 包使用远程 Web 服务模式。先将完整 Node 服务部署到 HTTPS 地址，再把该地址填入发布工具。

可在管理页填写地址，也可复制 .env.example 为 .env，设置 PICKONEQ_WEB_URL=https://你的域名 后重新启动工具自动预填。不要填写 127.0.0.1 或 localhost，它们在手机上指向手机自身。

“仅本地打包”生成 Debug 或 Release APK，不访问 GitHub。“一键打包并发布”还会：

1. 创建或复用 `v<versionName>` GitHub Release。
2. 上传 APK 并计算 SHA-256。
3. 更新仓库的 `app-update.json` 和 `docs/app-update.json`。
4. 在本地 `releases/` 保存同版本 APK 和升级清单。

## 环境

- JDK 17
- Gradle 8.13–8.x
- Android SDK Platform 35 或 36
- Android SDK Build-Tools
- GitHub Token：`PICKONEQ_GITHUB_TOKEN`，或 Windows Git Credential Manager 中已有的 GitHub 登录

工具会依次检查环境变量、项目 `.android-build-tools`、用户目录 `.pickoneq-android-build-tools`，并兼容读取原 YiLin2 的本地 Android 工具目录。

## 正式签名

线上发布强制使用 Release 签名。首次发布后必须永久保留 keystore、alias 和密码；后续版本只有使用同一证书才能覆盖安装。签名密码只进入当前 Gradle 子进程，不写入导出配置、Android 工程和构建日志。

## 升级清单

未填写清单地址时，发布工具根据 `owner/repository` 和分支生成：

```text
https://raw.githubusercontent.com/owner/repository/main/app-update.json
```

App 启动后读取清单。只有包名相同、`versionCode` 更高且 APK 哈希匹配时才允许安装更新。
