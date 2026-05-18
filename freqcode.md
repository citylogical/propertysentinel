## Manually push alert emails
curl 'https://www.propertysentinel.io/api/cron/daily-digest' \
  -H "Authorization: Bearer 4a3a5b1cdd2a47026b38d0a3368790892875799dddfe3348ead7bd6259866ee3"

curl -L -G "https://www.propertysentinel.io/api/cron/daily-digest" \
  -H "Authorization: Bearer 4a3a5b1cdd2a47026b38d0a3368790892875799dddfe3348ead7bd6259866ee3" \
  --data-urlencode "test=1" \
  --data-urlencode "test_email=jrmcmahon94@gmail.com" \
  --data-urlencode "test_subscriber_id=e938dd31-a594-40bc-9a20-82f3d6455c50"

  