# private-seat

分席。把一份 Grok 网页分给朋友用。每个人用自己的账号登录，只看见自己的对话。容器里的浏览器只登录一次，外层按人分标签页，两边实时传字。

第一个注册成功的账号是席主。客人必须有席主发出的邀请码才能开始。席主在浏览器层登录 Grok，客人不用 API key。

## 自己构建并运行

需要 Docker。在仓库根目录：

```bash
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export BETTER_AUTH_URL="http://localhost:8080"
export XAI_API_KEY="xai-你的密钥"   # 也可以留空，启动后在页面里贴

docker compose up --build
```

浏览器打开 `BETTER_AUTH_URL` 对应的地址。用邮箱注册。

容器里还有一个浏览器，专门开着 Grok 网页。席主用宿主机的 `6080` 端口打开它（画面密码默认 `seat-browser`，可用 `VNC_PASSWORD` 改掉），在里面登录 Grok。登录保存在卷 `grok-browser-profile` 里。外层每个人一个标签页：外面写下的话送进自己的那一页，网页上的回复再实时传回来。别人看不到这一页。同一时间只操作一个标签页。

把 `GROK_BROWSER_VIEW` 设成你在局域网里打开画面的地址，例如 `http://192.168.5.1:6080/vnc.html`，席主页面上才会出现正确链接。6080 不要暴露到公网。

| 变量 | 作用 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 签发登录会话。每次启动必须是同一段，换了会把所有人踢下线。 |
| `BETTER_AUTH_URL` | 你在浏览器地址栏里打开的完整地址，含协议和端口。用域名时写成 `https://你的域名`。 |
| `VNC_PASSWORD` | 浏览器画面的密码，默认 `seat-browser`。 |
| `GROK_BROWSER_VIEW` | 席主用来打开浏览器层的地址。 |
| `PGLITE_DATA_DIR` | 容器里已设为 `/data`。聊天和账号存在卷 `private-seat-data`，重建容器不会丢。 |

不设 `GROK_BROWSER_CDP` 时才使用 API key。`docker compose` 已经把浏览器层接上，不需要再贴 key。

自己的容器里用邮箱登录。Google 和 X 只在部署方另行提供 OAuth 客户端时可用，不把那组凭据放进源码。

构建镜像、不立刻启动：

```bash
docker build -t private-seat .
```

## 在网页上发给朋友

1. 发布应用，把网址发给朋友。你自己先登录，成为席主。
2. 打开「邀请」，贴上 API key 并保存。不贴也会用部署环境里的密钥，花费仍然算这把密钥。
3. 生成邀请码。朋友打开同一个网址，用自己的账号登录，输入邀请码后才有席位。

席主在「邀请」里只能看到客人的称呼和当天条数，没有对话内容。
