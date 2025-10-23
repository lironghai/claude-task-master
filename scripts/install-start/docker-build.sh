docker build -t registry.ljdong.net/tools/ai_mcp_server/task-manage:v0.0.1-snapshot .

docker login https://registry.ljdong.net/
docker push registry.ljdong.net/tools/ai_mcp_server/task-manage:v0.0.1-snapshot

