# 拾一问 Android 打包与发布

1. 先把拾一问 Node 服务部署到可由手机访问的 HTTPS 地址。
2. 在“应用信息”中填写该地址。
3. 本地测试可生成 Debug APK；线上发布必须配置同一份 Release keystore。
4. 在“打包与发布”中填写 GitHub 仓库与发布说明。
5. 一键发布会创建 GitHub Release、上传 APK，并更新仓库根目录和 `docs/` 下的 `app-update.json`。

GitHub 凭据优先读取 `PICKONEQ_GITHUB_TOKEN`，否则尝试复用 Windows Git Credential Manager。Token 和签名密码不会写入配置文件或构建日志。

此工具发布 APK 和升级清单，不负责部署拾一问 Node 服务。
