docker ps -a --format 'table {{.Names}}\t{{.Status}}'
echo '---LOG---'
docker logs --tail 40 arkhe-geth
