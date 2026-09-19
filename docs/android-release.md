# 拾一问 Android 打包与线上发布

## 可独立运行的本地 APK

本地 APK 会把前端、Express 服务、资料池与 Node Mobile 一并装入应用，不需要填写服务地址。默认同时构建 `arm64-v8a` 与 `armeabi-v7a`，兼容 64 位和 32 位 ARM Android 手机。

双击项目根目录的 `构建本地安卓安装包.cmd`，或运行：

```powershell
npm run build
npm run android:apk
```

输出文件：`releases/pickoneq-local-debug.apk`。

本地包使用带 Android 16 KB 页面修复的 Node Mobile 18.20.4-2。JNI 启动桥接使用 Node Mobile 要求的连续参数内存；原生库加载失败会在应用内显示 Android 版本、ABI 与错误详情，不再直接闪退。构建结束前会检查 APK 中所有原生库的 ELF 结构，并对 64 位 ABI 强制检查 16 KB LOAD 对齐；不兼容时会明确失败，不再产出可能安装后打不开的 APK。

首次启动需要解压内置服务，通常比后续启动慢。应用最多等待 90 秒，并在失败时显示设备内诊断，可重新检测、修复内置资源或重启应用。本地作答数据不会因这些恢复操作被清除。

如需额外构建模拟器架构：

```powershell
node tools/android-release/scripts/build-local-android.mjs --abi arm64-v8a,x86_64
```

## 远程服务包装与线上发布

远程模式用于把已部署的 HTTPS 服务包装成 APK，并支持正式签名、GitHub Release 和应用内更新。双击 `打开安卓打包发布工具.cmd`，或运行：

```powershell
npm run android:release
```

纯命令行构建远程包装 APK：

```powershell
npm run android:remote-apk
```

远程模式必须填写手机可访问的完整 HTTP/HTTPS 地址。`127.0.0.1` 和 `localhost` 在手机上指向手机自身，不能用于远程包装。

“一键打包并发布”会：

1. 创建或复用 `v<versionName>` GitHub Release。
2. 上传 APK 并计算 SHA-256。
3. 更新仓库的 `app-update.json` 和 `docs/app-update.json`。
4. 在本地 `releases/` 保存同版本 APK 和升级清单。

## 构建环境

- Node.js 22 或更高版本
- JDK 17
- Gradle 8.13–8.x
- Android SDK Platform 35 或 36
- Android SDK Build-Tools、NDK 28.2.13676358、CMake 3.22.1
- 线上发布另需 GitHub Token：`PICKONEQ_GITHUB_TOKEN`，或 Windows Git Credential Manager 中已有的 GitHub 登录

工具会依次检查环境变量、项目 `.android-build-tools`、用户目录 `.pickoneq-android-build-tools`，并兼容读取原 YiLin2 的本地 Android 工具目录。

## 正式签名与升级清单

线上发布强制使用 Release 签名。首次发布后必须永久保留 keystore、alias 和密码；后续版本只有使用同一证书才能覆盖安装。签名密码只进入当前 Gradle 子进程，不写入导出配置、Android 工程和构建日志。

未填写升级清单地址时，发布工具根据 `owner/repository` 和分支生成：

```text
https://raw.githubusercontent.com/owner/repository/main/app-update.json
```

App 启动后读取清单。只有包名相同、`versionCode` 更高且 APK 哈希匹配时才允许安装更新。
