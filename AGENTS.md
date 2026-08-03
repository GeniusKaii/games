# 仓库协作约定

## 提交与推送

- 在本仓库完成改动并验证 OK 后，直接 `git add`、`git commit`、`git push origin main`，无需再向用户询问。
- 提交信息沿用现有风格：`feat:` / `fix:` / `chore:` 前缀，简洁描述。

## 红线

- `7ab6ec3f73655e4153fa81701cd2a326.txt` 是微信域名审核校验文件，**严禁改动、删除、重命名或移动**。
- `.idea/` 已由 `.gitignore` 忽略，不要提交 IDE 配置。

## 质量要求

- 游戏类改动尽量跑一遍 `node tower-defense/dev-sim.js`（逻辑模拟）和 `node tower-defense/dev-browser-test.js`（浏览器自动化），确认通过再提交。
