# private-seat

分席。把一份 Grok 网页分给朋友用。每个人用自己的账号登录，只看见自己的对话。容器里的浏览器只登录一次，外层按人分标签页，两边实时传字。

第一个注册成功的账号是席主。客人必须有席主发出的邀请码才能开始。席主在浏览器层登录 Grok，客人不用 API key。

## 自己构建并运行

需要 Docker。在仓库根目录：

```bash
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"

docker compose up --build
```

用路由器的局域网地址打开，不要用 localhost。例如 `http://192.168.5.1:8080`。登录跳转会留在这个地址上。

浏览器层是同一台机器的 `6080` 端口：`http://192.168.5.1:6080/vnc.html`，密码默认 `seat-browser`。页面上的「浏览器层」链接也按你打开网页的地址生成，不会再跳到 `127.0.0.1`。

| 变量 | 作用 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 签发登录会话。每次启动必须是同一段，换了会把所有人踢下线。 |
| `VNC_PASSWORD` | 浏览器画面的密码，默认 `seat-browser`。 |
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
